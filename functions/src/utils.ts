import * as admin from "firebase-admin";

export type NotificationQueuePayload = {
  company_id?: string;
  uid?: string;
  title?: string;
  message?: string;
  body?: string;
  type?: string;
  ref_type?: string;
  ref_id?: string;
  related_id?: string;
  status?: string;
  retry_count?: number;
  created_at?: number;
  data?: Record<string, unknown>;
};

export function toStringValue(value: unknown, fallback = ""): string {
  if (value === undefined || value === null) return fallback;
  return String(value);
}

export function nowMs(): number {
  return Date.now();
}

export function buildFcmData(
  companyId: string,
  uid: string,
  queueId: string,
  payload: NotificationQueuePayload
): Record<string, string> {
  const refType = toStringValue(payload.ref_type || payload.type, "info");
  const refId = toStringValue(payload.ref_id || payload.related_id, "");

  const baseData: Record<string, string> = {
    company_id: companyId,
    uid,
    queue_id: queueId,
    type: toStringValue(payload.type, "info"),
    ref_type: refType,
    ref_id: refId,
    related_id: toStringValue(payload.related_id || payload.ref_id, ""),
    click_action: "FLUTTER_NOTIFICATION_CLICK",
  };

  if (payload.data && typeof payload.data === "object") {
    for (const [key, value] of Object.entries(payload.data)) {
      if (value === undefined || value === null) continue;
      baseData[key] = String(value);
    }
  }

  return baseData;
}

export function isInvalidTokenError(errorCode: string): boolean {
  return (
    errorCode === "messaging/registration-token-not-registered" ||
    errorCode === "messaging/invalid-registration-token" ||
    errorCode === "messaging/invalid-argument"
  );
}

export async function writeNotificationLog(params: {
  db: admin.firestore.Firestore;
  companyId: string;
  queueId: string;
  uid: string;
  status: "sent" | "failed" | "skipped";
  title: string;
  body: string;
  tokenCount: number;
  successCount: number;
  failedCount: number;
  error?: string | null;
}) {
  const {
    db,
    companyId,
    queueId,
    uid,
    status,
    title,
    body,
    tokenCount,
    successCount,
    failedCount,
    error,
  } = params;

  await db
    .collection("companies")
    .doc(companyId)
    .collection("notification_logs")
    .add({
      queue_id: queueId,
      uid,
      status,
      title,
      body,
      token_count: tokenCount,
      success_count: successCount,
      failed_count: failedCount,
      error: error || null,
      created_at: nowMs(),
    });
}
