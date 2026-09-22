# Parknacross Weather — GitHub website files

This archive contains the **website front end only**. Its files belong in the root of the Parknacross Weather GitHub Pages repository.

**Do not use this archive to replace, create, or deploy a Cloudflare Worker.** It intentionally contains no Cloudflare Worker source code. Keep the separately maintained, currently deployed Cloudflare Worker unchanged. The browser service worker (`service-worker.js`) is a website caching component, **not** the Cloudflare API Worker; keep that file in GitHub.

Deployment: extract this ZIP, then upload the extracted files to the GitHub repository root. If GitHub still contains old files named `worker.js`, `cloudflare-worker.js`, `worker-v*.js` or `Parknacross-worker-*.txt`, remove those **from GitHub only** so no one accidentally deploys an outdated backend. Do not delete or replace the actual Worker in Cloudflare.

This cleanup removes obsolete backend copies and historic deployment notes; it does not alter the site's HTML, CSS, live weather code, or the separately deployed Cloudflare Worker.

## Visitor names on photo likes

Deploy `Parknacross-worker-v38.4.50-admin-like-names.txt` separately in Cloudflare **before** uploading this GitHub ZIP. The public Like remains anonymous unless a visitor voluntarily enters a display name; the name is visible only in the admin view at `/?admin=1`, following an ADMIN_KEY check. Previously recorded anonymous likes remain anonymous. Do not place the Worker TXT, admin key, or backend code in GitHub. The names are visitor-supplied and are not verified identities.

## Sky photo archive

Worker v38.4.51 archives every successful Today’s Sky upload permanently in the existing `SKY_PHOTOS` R2 bucket and records its metadata in D1. The public dashboard still displays only the current day’s photo. Open the dashboard with `?admin=1` and choose **View photo archive** to browse and download archived photos. The archive endpoints require the existing `ADMIN_KEY`.

The first admin archive view (or the next upload) also preserves the photo that was already current when archive support was deployed. Photos that had already been replaced before archive support was deployed cannot be recovered automatically because the earlier system stored only `today/current`.
