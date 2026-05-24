import * as admin from "firebase-admin";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import {
  buildFcmData,
  isInvalidTokenError,
  nowMs,
  NotificationQueuePayload,
  toStringValue,
  writeNotificationLog,
} from "./utils";

const REGION = "asia-southeast1";

export const onNotificationQueueCreated = onDocumentCreated(
  {
    document: "companies/{companyId}/notification_queue/{queueId}",
    region: REGION,
    memory: "256MiB",
    timeoutSeconds: 60,
  },
  async (event) => {
    const db = admin.firestore();
    const messaging = admin.messaging();

    const companyId = event.params.companyId;
    const queueId = event.params.queueId;
    const snapshot = event.data;

    if (!snapshot) return;

    const queueRef = snapshot.ref;
    const payload = snapshot.data() as NotificationQueuePayload;

    const uid = toStringValue(payload.uid);
    const status = toStringValue(payload.status, "pending");

    if (!uid) {
      await queueRef.set(
        {
          status: "failed",
          failed_at: nowMs(),
          error: "Queue payload missing uid.",
          updated_at: nowMs(),
        },
        { merge: true }
      );

      await writeNotificationLog({
        db,
        companyId,
        queueId,
        uid: "",
        status: "failed",
        title: toStringValue(payload.title, "MYPRESENSI"),
        body: toStringValue(payload.body || payload.message, ""),
        tokenCount: 0,
        successCount: 0,
        failedCount: 0,
        error: "Queue payload missing uid.",
      });

      return;
    }

    if (status !== "pending") return;

    const title = toStringValue(payload.title, "MYPRESENSI");
    const body = toStringValue(payload.body || payload.message, "");

    try {
      await queueRef.set(
        {
          status: "processing",
          processing_at: nowMs(),
          updated_at: nowMs(),
        },
        { merge: true }
      );

      const tokensSnapshot = await db
        .collection("companies")
        .doc(companyId)
        .collection("users")
        .doc(uid)
        .collection("fcm_tokens")
        .where("active", "==", true)
        .get();

      const tokens = tokensSnapshot.docs
        .map((doc) => {
          const data = doc.data();
          return {
            token: toStringValue(data.token),
            ref: doc.ref,
          };
        })
        .filter((item) => item.token.length > 0);

      if (tokens.length === 0) {
        await queueRef.set(
          {
            status: "failed",
            token_count: 0,
            success_count: 0,
            failed_count: 0,
            failed_at: nowMs(),
            error: "No active FCM token found for user.",
            updated_at: nowMs(),
          },
          { merge: true }
        );

        await writeNotificationLog({
          db,
          companyId,
          queueId,
          uid,
          status: "failed",
          title,
          body,
          tokenCount: 0,
          successCount: 0,
          failedCount: 0,
          error: "No active FCM token found for user.",
        });

        return;
      }

      const data = buildFcmData(companyId, uid, queueId, payload);

      const message: admin.messaging.MulticastMessage = {
        tokens: tokens.map((item) => item.token),
        notification: {
          title,
          body,
        },
        data,
        android: {
          priority: "high",
          notification: {
            channelId: "mypresensi_high_importance_channel",
            priority: "high",
            defaultSound: true,
            defaultVibrateTimings: true,
            clickAction: "FLUTTER_NOTIFICATION_CLICK",
          },
        },
      };

      const response = await messaging.sendEachForMulticast(message);
      let invalidTokenCount = 0;

      await Promise.all(
        response.responses.map(async (result, index) => {
          if (result.success) return;

          const tokenInfo = tokens[index];
          const code = result.error?.code || "";
          const message = result.error?.message || "Unknown FCM error";

          if (isInvalidTokenError(code)) {
            invalidTokenCount += 1;
            await tokenInfo.ref.set(
              {
                active: false,
                invalidated_at: nowMs(),
                invalid_reason: code || message,
                updated_at: nowMs(),
              },
              { merge: true }
            );
          }
        })
      );

      const finalStatus = response.successCount > 0 ? "sent" : "failed";

      await queueRef.set(
        {
          status: finalStatus,
          token_count: tokens.length,
          success_count: response.successCount,
          failed_count: response.failureCount,
          invalid_token_count: invalidTokenCount,
          sent_at: response.successCount > 0 ? nowMs() : null,
          failed_at: response.successCount === 0 ? nowMs() : null,
          error:
            response.successCount > 0
              ? null
              : "Failed sending FCM to all active tokens.",
          updated_at: nowMs(),
        },
        { merge: true }
      );

      await writeNotificationLog({
        db,
        companyId,
        queueId,
        uid,
        status: finalStatus,
        title,
        body,
        tokenCount: tokens.length,
        successCount: response.successCount,
        failedCount: response.failureCount,
        error:
          response.successCount > 0
            ? null
            : "Failed sending FCM to all active tokens.",
      });
    } catch (error: any) {
      const retryCount = Number(payload.retry_count || 0);

      await queueRef.set(
        {
          status: "failed",
          retry_count: retryCount + 1,
          failed_at: nowMs(),
          error: error?.message || String(error),
          updated_at: nowMs(),
        },
        { merge: true }
      );

      await writeNotificationLog({
        db,
        companyId,
        queueId,
        uid,
        status: "failed",
        title,
        body,
        tokenCount: 0,
        successCount: 0,
        failedCount: 0,
        error: error?.message || String(error),
      });
    }
  }
);
