# Cloudflare Worker deployment

`worker.mjs` is the single current deployment source (38.4.93). Replace the complete Cloudflare Worker code with this file and deploy. Preserve the existing bindings, secrets and scheduled triggers. No credential values belong in this repository.

Historical root Worker copies are retained under `history/` for reference only and must not be deployed. This directory is excluded from the GitHub Pages site.

After deployment, verify `/health`, current readings, Wexford warnings and the admin compatibility check. Warning failure must display unavailable, never an unverified all-clear.
