# Cloudflare Worker deployment

`worker.mjs` is the single current deployment source (38.4.237). Replace the complete Cloudflare Worker code with this file and deploy. Preserve the existing bindings, secrets and scheduled triggers. No credential values belong in this repository.

Historical root Worker copies are retained under `history/` for reference only and must not be deployed. This directory is excluded from the GitHub Pages site.

After deployment, verify `/health`, current readings, Wexford warnings and the admin compatibility check. Warning failure must display unavailable, never an unverified all-clear.

Version 38.4.95 adds bounded per-instance throttles for photo writes and failed admin authentication (30 per minute per trusted Cloudflare client IP). These complement, rather than replace, global Cloudflare edge rate limits. Successful authentication remains available even after failed attempts. No new bindings or secrets are required. Verify the account edge configuration separately.

Version 38.4.95 removes per-observation calendar formatting from coverage and rain events, adds hourly outdoor guidance, and supports encrypted opt-in Web Push via the existing D1 binding and scheduled trigger. No new bindings, secrets or third-party service account are required. A private VAPID signing key is created once in the existing metadata table. Background subscriptions are stored separately and managed by anonymous device tokens. Deploy this Worker before enabling background alerts and the outdoor outlook. Check /coverage?days=371 and /rain-events?days=30 after deployment.


Version 38.4.237 improves the daily Facebook and X post recovery path. The scheduled Worker retries during the morning window, then every 30 minutes while either platform remains unconfirmed. It uses a fresh same-day weather observation when the 07:30 observation is too old, shows the last attempt in admin diagnostics, and adds an authenticated “Retry missing posts now” control. Successful platforms remain protected by per-network day markers. No new bindings or secrets are required. Deploy `_worker/worker.mjs` in Cloudflare as well as the GitHub Pages website; a Pages deployment alone does not activate the publishing fix.


Version 38.4.237 streams CSV downloads in bounded D1 pages instead of loading and reversing the full result set in Worker memory. This avoids resource exhaustion on 90-day and 365-day downloads. Large and custom-range exports bypass edge-cache cloning; 7- and 30-day fixed-window downloads keep their existing cache. No new bindings or secrets are required. Deploy `_worker/worker.mjs` in Cloudflare to activate the export fix; a GitHub Pages deployment alone does not update the Worker.
