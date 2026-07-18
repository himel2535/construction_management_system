# Firebase Setup for cPanel-hosted App

## Config (in app)

File: `firebase.js` (project root)

| Field | Value |
|-------|--------|
| projectId | erptriniti |
| databaseURL | https://erptriniti-default-rtdb.firebaseio.com |

No MySQL, no `api/config.local.php` — static JS only.

## One-time: Create Realtime Database

1. [Firebase Console](https://console.firebase.google.com) → **erptriniti**
2. **Build** → **Realtime Database** → **Create Database**
3. Choose region → deploy open rules from repo root:

```bash
firebase login
firebase use erptriniti
firebase deploy --only database
```

Rules file: `database.rules.json` (demo: read/write true)

## Deploy frontend

```powershell
powershell -File scripts/deploy-pack.ps1 -BumpVersion
```

Upload `dist/triniti-deploy-YYYYMMDD.zip` to cPanel `public_html` → Extract → purge cache.

## Verify

1. Open site — no "MySQL API unavailable"
2. F12 Console: `[ERP] build … — Firebase RTDB (erptriniti)`
3. No `permission_denied` errors
4. Firebase Console → Data tab shows records after creating a customer

## Security note

Demo mode uses open rules. For production, see [FIREBASE_SECURE.md](FIREBASE_SECURE.md) (Firebase Auth + `database.rules.secure.json`).

## Partial seed repair

If `companyProfile` exists but `tenantData` is empty, either open the site once (fixed `ensureFirebaseSeed`) or run:

```powershell
powershell -File scripts/seed-rtdb-demo.ps1
```
