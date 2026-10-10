# Cloudflare Worker deployment

`worker.mjs` is the single current deployment source (38.4.94). Replace the complete Cloudflare Worker code with this file and deploy. Preserve the existing bindings, secrets and scheduled triggers. No credential values belong in this repository.

Historical root Worker copies are retained under `history/` for reference only and must not be deployed. This directory is excluded from the GitHub Pages site.

After deployment, verify `/health`, current readings, Wexford warnings and the admin compatibility check. Warning failure must display unavailable, never an unverified all-clear.

Version 38.4.94 adds bounded per-instance throttles for photo writes and failed admin authentication (30 per minute per trusted Cloudflare client IP). These complement, rather than replace, global Cloudflare edge rate limits. Successful authentication remains available even after failed attempts. No new bindings or secrets are required. Verify the account edge configuration separately.
