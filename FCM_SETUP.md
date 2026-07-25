# FCM (Firebase Cloud Messaging) Setup — Corelyx Android

> Purpose: enable Guard push notifications on Android sideload APKs.
> The app package id is `app.corelyx.mobile`.

## 1. Create a Firebase project

1. Go to <https://console.firebase.google.com/> and sign in with the Corelyx Google account.
2. **Add project** → name it `corelyx-mobile` (or similar). Disable Google Analytics unless needed.
3. Once created, open the project → **⚙️ Project settings** → **General** tab.
4. Scroll to **Your apps** and click the **Android** (</>) icon.
5. Register app:
   - Android package name: `app.corelyx.mobile`
   - App nickname: `Corelyx`
   - SHA-1 / Debug signing cert: skip for now.
6. Click **Register app** → **Download `google-services.json`**.

## 2. Install `google-services.json`

Place the downloaded file at:

```
apps/mobile/google-services.json
```

> `app.json` already references `"googleServicesFile": "./google-services.json"` under the `android` block.
> **Do NOT commit this file** — it is already in `.gitignore`. Verify with:
> ```bash
> git check-ignore apps/mobile/google-services.json
> ```

## 3. Generate an FCM V1 service-account key

Push via the Expo Push API on EAS requires a **FCM V1** service-account JSON (not the legacy server key).

1. In Firebase Console → **⚙️ Project settings** → **Service accounts** tab.
2. Click **Generate new private key** → confirm → a JSON file downloads (named like `corelyx-mobile-firebase-adminsdk-xxxxx.json`).
3. Rename it to something stable, e.g. `corelyx-fcm-v1.json`, and keep it somewhere safe (password manager / 1Password vault).

## 4. Upload the FCM key to EAS

```bash
cd apps/mobile
eas credentials
```

Then:

1. Select **Android**.
2. Select **Push Notifications: manage your FCM V1 credentials**.
3. Choose **Upload a new FCM V1 credential**.
4. Point it at the service-account JSON from step 3.
5. Confirm. EAS will print the credential slug — note it down.

> This key is stored on EAS's servers and is used by Expo's Push API to forward notifications to FCM on your behalf.
> You do **not** need to bake the service-account JSON into the APK.

## 5. Rebuild the APK

```bash
cd apps/mobile
eas build --profile preview --platform android --clear-cache
```

- `--clear-cache` is important so the prebuild picks up the new `google-services.json`.
- Once the build finishes, download the `.apk` and install it on the device.

## 6. Verify Guard push with the app closed

1. Open the freshly-installed app, sign in, and **force-close** it (swipe it away from recents).
2. Trigger a Guard notification from the backend (the server-side path is `lib/push.ts`, using `EXPO_ACCESS_TOKEN`).
   Example minimal payload:
   ```json
   {
     "to": "<device ExponentPushToken>",
     "title": "Guard test",
     "body": "FCM via EAS — app was closed",
     "data": { "kind": "guard" }
   }
   ```
3. Expected result:
   - The notification appears in the system tray within ~5 seconds.
   - Tapping it wakes the app and routes to the Guard screen.
4. If it doesn't arrive:
   - Confirm the device's push token is registered (`POST /api/me/push-token`).
   - Check `adb logcat | grep -i "expo\|fcm"` for delivery errors.
   - Re-run `eas credentials` and confirm the FCM V1 slug matches the one you uploaded.

## Checklist

- [ ] Firebase project exists for `app.corelyx.mobile`
- [ ] `apps/mobile/google-services.json` is in place (not committed)
- [ ] FCM V1 service-account JSON uploaded via `eas credentials`
- [ ] APK rebuilt with `--clear-cache`
- [ ] Guard push received with app force-closed

## Rollback

If something breaks:

1. Remove `"googleServicesFile"` from `apps/mobile/app.json`.
2. Delete `apps/mobile/google-services.json`.
3. Rebuild without `--clear-cache`.
