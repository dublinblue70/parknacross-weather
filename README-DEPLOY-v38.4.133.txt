PARKNACROSS WEATHER v38.4.133 PATCH

This package contains GitHub Pages website files only. It does not contain a Cloudflare Worker update.

HOW TO APPLY
1. Open the parknacross-weather GitHub repository.
2. Replace the same-named files in the repository root with the files from this package.
3. Commit/publish the changes and allow GitHub Pages to finish deploying.
4. Refresh the site after deployment. The service-worker cache was bumped so visitors receive the updated assets.

Also delete any of these retired/duplicate files if they are still present in the GitHub repository root:
- cloudflare-worker.js
- worker.js
- worker-v38.4.47-photo-likes.js
- Parknacross-worker-v38.4.47-photo-likes.txt
- Parknacross-worker-v38.4.48-like-once.txt
- Parknacross-worker-v38.4.78-MARINE-FEED-FAILOVER.js
- intelligence.js
- intelligent-features.spec.mjs
- mobile-menu.spec.mjs

The patch includes the Dashboard, Summary, Rain, System Status and Today’s Sky pages and scripts, shared styles, service worker, package metadata and smoke test.

The changes are not live until GitHub Pages finishes publishing them.
