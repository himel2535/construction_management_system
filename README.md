# Triniti ERP - Firebase RTDB (erptriniti)

Clean deploy copy. Build: 20260524.4

## cPanel upload (45 files only)

1. cPanel File Manager -> public_html
2. DELETE: api/ folder, svc_api.js, database/, assets/
3. Settings -> Show Hidden Files ON (for .htaccess)
4. Select ALL files in THIS folder ROOT except:
   - README.md
   - firebase/ folder
5. Upload -> overwrite all
6. LiteSpeed Cache -> Purge All
7. Browser Ctrl+Shift+R on https://triniti.sellxify.com

## Verify

- Site loads without "MySQL API unavailable"
- F12 Console: [ERP] build 20260524.4 - Firebase RTDB (erptriniti)
- https://triniti.sellxify.com/svc_api.js should be 404

From dev PC (source repo):
  powershell -File f:\realestate-erp\scripts\verify-firebase.ps1 -Strict

## Firebase rules (demo - open read/write)

Rules live in firebase/ subfolder. Deploy from PC:
  cd firebase
  firebase deploy --only database

Do NOT upload firebase/ folder to cPanel public_html.

## Re-sync after code changes

  powershell -File f:\realestate-erp\scripts\export-clean-to-f.ps1
