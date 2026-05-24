import * as admin from "firebase-admin";

admin.initializeApp();

export { onNotificationQueueCreated } from "./fcmQueueProcessor";
