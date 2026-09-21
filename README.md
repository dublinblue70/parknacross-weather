# Parknacross Weather — GitHub website files

This archive contains the **website front end only**. Its files belong in the root of the Parknacross Weather GitHub Pages repository.

**Do not use this archive to replace, create, or deploy a Cloudflare Worker.** It intentionally contains no Cloudflare Worker source code. Keep the separately maintained, currently deployed Cloudflare Worker unchanged. The browser service worker (`service-worker.js`) is a website caching component, **not** the Cloudflare API Worker; keep that file in GitHub.

Deployment: extract this ZIP, then upload the extracted files to the GitHub repository root. If GitHub still contains old files named `worker.js`, `cloudflare-worker.js`, `worker-v*.js` or `Parknacross-worker-*.txt`, remove those **from GitHub only** so no one accidentally deploys an outdated backend. Do not delete or replace the actual Worker in Cloudflare.

This cleanup removes obsolete backend copies and historic deployment notes; it does not alter the site's HTML, CSS, live weather code, or the separately deployed Cloudflare Worker.
