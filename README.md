# MYPRESENSI Backend

Cloud Functions backend untuk mengirim push notification FCM dari antrean Firestore.

## Target

Firebase project:

```text
inventory-410f4
```

Firestore database:

```text
(default)
```

## Alur

```text
admin_web
→ companies/{companyId}/notification_queue/{queueId}
→ Cloud Functions
→ companies/{companyId}/users/{uid}/fcm_tokens
→ Firebase Cloud Messaging
→ Flutter status bar notification
```

## Setup

```bash
npm install -g firebase-tools
firebase login
firebase use inventory-410f4
cd functions
npm install
npm run build
cd ..
firebase deploy --only functions
```

Deploy rules juga:

```bash
firebase deploy --only firestore:rules,functions
```

## Test

1. Login Flutter app.
2. Pastikan token ada di `companies/{companyId}/users/{uid}/fcm_tokens`.
3. Publish pengumuman dari admin_web.
4. Cek `companies/{companyId}/notification_queue`.
5. Status queue harus berubah dari `pending` menjadi `sent` atau `failed`.
6. Kalau `failed`, cek field `error`.
