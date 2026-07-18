# cPanel Deploy — Real Estate ERP (Firebase RTDB)

Production deploy uses an **esbuild bundle** — **6–8 files** (~120–180 KB ZIP), not 55 separate JS modules.

## Requirements

- **Node.js 18+** (for `npm run build` on your PC only — not needed on cPanel)
- Firebase RTDB enabled for project `erptriniti`

## Quick deploy (ZIP — recommended)

```powershell
cd f:\realestate-erp
npm install
powershell -File scripts/deploy-pack.ps1 -BumpVersion
```

| Output | Purpose |
|--------|---------|
| `dist/triniti-deploy-YYYYMMDD.zip` | Upload **one file** to cPanel |
| `dist/deploy/` | Preview of `public_html` contents |
| `dist/cpanel-upload/` | Same files for drag-and-drop upload |

### cPanel steps

1. **File Manager** → `public_html`
2. **Delete** legacy files if present:
   - `api/` folder
   - `app.js`, `router.js`
   - `page_*.js`, `cmp_*.js`, `svc_*.js` (keep **`firebase.js`** — it is in the bundle package)
   - `util_*.js`
3. Upload **`dist/triniti-deploy-YYYYMMDD.zip`**
4. **Extract** → overwrite
5. LiteSpeed Cache → **Purge All**
6. Hard refresh: `Ctrl+Shift+R`

### Production files (after extract)

| File | Role |
|------|------|
| `index.html` | Loads `app.bundle.js` |
| `app.bundle.js` | All app modules (minified) |
| `firebase.js` | Firebase config (editable on server) |
| `styles.css` | Minified CSS |
| `version.js` | Build version |
| `.htaccess` | Cache / routing rules |

## Direct upload (no ZIP)

```powershell
npm install
powershell -File scripts/upload-static-files.ps1
```

Upload everything from **`dist/cpanel-upload/`** (see `dist/CPANEL-UPLOAD-FILES.txt`).

## Hotfix (CSS or JS only)

```powershell
npm run build
# Upload only changed files from dist/deploy/, e.g.:
#   styles.css
#   app.bundle.js
```

Or:

```powershell
powershell -File scripts/deploy-pack.ps1 -Hotfix "styles.css"
```

## F: drive unbundled deploy (direct file upload)

If you upload from **`F:\realestate-erp\`** to `public_html` (not ZIP/dist):

1. See **`UPLOAD-F-DRIVE-NOW.txt`** for the exact file list
2. **Critical:** upload `svc_payroll.js` whenever Workers or Site In-charge pages change
3. Optional FTP: `powershell -File scripts/upload-unbundled-f.ps1` (set `FTP_HOST`, `FTP_USER`, `FTP_PASS`)

After upload: LiteSpeed Purge All, Ctrl+Shift+R. Network tab: `svc_payroll.js` must be **200**.

## Local development

Root `index.html` still loads unbundled **`app.js`** — no build step needed for day-to-day dev.

## Pre-flight

```powershell
# Source checks (dev)
powershell -File scripts/deploy-verify-local.ps1

# After build
npm run build
powershell -File scripts/deploy-verify-local.ps1 -BundleMode
```

## One-time Firebase setup

See [docs/FIREBASE_CPANEL.md](docs/FIREBASE_CPANEL.md):

1. Firebase Console → **erptriniti** → enable **Realtime Database**
2. Deploy rules: `firebase deploy --only database` (uses `database.rules.json`)

## Verify

- Site opens without "MySQL API unavailable"
- Browser console: `[ERP] build … — Firebase RTDB (erptriniti)`
- No `permission_denied` in console
- **Suppliers** and **Projects** pages load (included in bundle)

### Remote HEAD checks (after upload)

```powershell
powershell -File scripts/deploy-verify-remote.ps1 -BaseUrl "https://your-domain.com"
```

Expect: `app.bundle.js` and `firebase.js` return **200**; `app.js` and `svc_payroll.js` return **404** (not 200).

## Troubleshooting

### `svc_payroll.js` — MIME type `text/html`

The browser requested a `.js` file but the server returned **HTML** (`index.html`). This happens when:

1. **`index.html` still loads unbundled `app.js`** (cached or not replaced) instead of `app.bundle.js`
2. **`svc_payroll.js` was never uploaded** (partial deploy) and `.htaccess` used to serve `index.html` for missing paths

**Fix:** Deploy the full ZIP from `dist/triniti-deploy-*.zip`. Delete `app.js`, `page_*.js`, `svc_*.js`, `cmp_*.js`, `util_*.js` from `public_html`. Only keep the 7 bundle files. Purge LiteSpeed cache and hard-refresh.

Updated `.htaccess` returns **404** for missing static assets (clearer than HTML-as-JS).

### `share-modal.js` addEventListener error

Not part of this ERP. Injected by cPanel/hosting (Site Publisher, theme, addon). Disable that script in hosting panel — it does not affect the ERP bundle.

## Optional FTP upload

```powershell
$env:FTP_HOST = "your-host.com"
$env:FTP_USER = "your-cpanel-user"
$env:FTP_PASS = "your-password"
powershell -File scripts/upload-deploy-zip.ps1
```

Or `scripts/upload-static-files.ps1` for the 6-file bundle.

## Production security (after demo)

See [docs/FIREBASE_SECURE.md](docs/FIREBASE_SECURE.md) for Firebase Auth + `database.rules.secure.json`.
