# Cloudflare Worker deployment

`worker.mjs` is the single current deployment source (38.4.95). Replace the complete Cloudflare Worker code with this file and deploy. Preserve the existing bindings, secrets and scheduled triggers. No credential values belong in this repository.

Historical root Worker copies are retained under `history/` for reference only and must not be deployed. This directory is excluded from the GitHub Pages site.

After deployment, verify `/health`, current readings, Wexford warnings and the admin compatibility check. Warning failure must display unavailable, never an unverified all-clear.

Version 38.4.95 adds bounded per-instance throttles for photo writes and failed admin authentication (30 per minute per trusted Cloudflare client IP). These complement, rather than replace, global Cloudflare edge rate limits. Successful authentication remains available even after failed attempts. No new bindings or secrets are required. Verify the account edge configuration separately.

Version 38.4.95 removes per-observation calendar formatting from coverage and rain events, adds hourly outdoor guidance, and supports encrypted opt-in Web Push via the existing D1 binding and scheduled trigger. No new bindings, secrets or third-party service account are required. A private VAPID signing key is created once in the existing metadata table. Background subscriptions are stored separately and managed by anonymous device tokens. Deploy this Worker before enabling background alerts and the outdoor outlook. Check /coverage?days=371 and /rain-events?days=30 after deployment.
