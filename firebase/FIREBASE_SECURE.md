# Firebase RTDB — Production security (after demo)

Demo mode uses open rules in [`database.rules.json`](../database.rules.json) (`.read: true`, `.write: true`). **Do not store real business data** until you complete the steps below.

## 1. Enable Firebase Authentication

1. [Firebase Console](https://console.firebase.google.com) → **erptriniti** → **Authentication** → **Get started**
2. Enable **Email/Password** (or Google, as needed)
3. Create owner user(s) in Console or invite via app

## 2. Deploy secure rules

Rules template: [`database.rules.secure.json`](../database.rules.secure.json)

```bash
firebase login
firebase use erptriniti
# Temporarily point firebase.json at secure rules, or:
firebase deploy --only database --config firebase.secure.json
```

Or paste `database.rules.secure.json` into Console → Realtime Database → **Rules** → **Publish**.

## 3. App changes (required before secure rules)

| Area | Change |
|------|--------|
| [`app.js`](../app.js) | Replace demo boot with Firebase Auth (`onAuthStateChanged`) |
| [`page_login.js`](../page_login.js) | `signInWithEmailAndPassword` / sign-out |
| [`svc_auth.js`](../svc_auth.js) | Map `auth.uid` to `roles/{uid}` |
| [`svc_firebaseOps.js`](../svc_firebaseOps.js) | Server-side validation via Cloud Functions (recommended for vouchers/EMI) |

Until login is wired, deploying secure rules will cause `permission_denied` in the browser.

## 4. What secure rules cover

- Global paths: `companyProfile`, `roles`, `accounts`, `counters`, `vouchers`
- Tenant data: `tenantData/{tenantId}/...` (read/write when `auth != null`)
- `reportsCache` and `emiCollections`: read-only from client (writes via trusted path)

Extend rules as you add collections (gov project paths under `tenantData`).

## 5. Optional hardening

- **App Check** — reduce abuse of public API key
- **Cloud Functions** — voucher posting, counter sequences, audit log
- **Backups** — scheduled RTDB export to Cloud Storage
- **Separate Firebase project** for production vs demo

## Rollback to demo

Redeploy [`database.rules.json`](../database.rules.json) (open read/write) and use demo boot in `app.js` only on non-production URLs.
