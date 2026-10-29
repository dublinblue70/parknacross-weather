# Parknacross Weather — deployment and maintenance

Website: https://parknacrossweather.ie · GitHub Pages (main branch)
Site release: see `package.json` and the active `service-worker.js` cache name.

## Cloudflare Worker — authoritative source

**Use `_worker/worker.mjs` as the current Worker source for new deployments.**
The root-level `worker.mjs` is an older historical snapshot (v38.4.96);
**do not deploy it over the live service.** Older examples under `_worker/history/`
are not deployable sources either.

A GitHub Pages commit does **not** deploy Cloudflare Worker code. The live
Worker version must be verified independently; the source file's version
comment alone does not prove what is running in Cloudflare.

Before any Worker deployment: check the binding names, secrets, D1 and R2
resources, schedules, routes and rate limits in the Cloudflare account.
Never commit credentials, API keys or tokens.

After deployment: verify `/health`, `/current`, `/stats`, `/daily?days=8`,
`/rain-summary`, Wexford weather warnings, archive writes, photo operations
and a read-only admin capability check. A failed warning source must show
**unavailable**, never an unverified all-clear.

## Website releases

1. Make changes in GitHub, then check the **Website release checks** workflow.
2. The release includes smoke, worker-export, unit, browser and PWA checks;
   deployment success alone is not a passing quality gate.
3. Confirm the Pages deployment and public monitoring workflows succeeded.
4. Verify the current PWA release on a physical phone; check that a pending
   update does not interrupt form edits or uploads.
5. Compare daily rain and weather extrema across `/stats`, `/daily`,
   History, Rain Centre and Records before declaring data reconciliation.
6. Update sitemap modification dates only for pages actually modified.

All times shown to visitors use the `Europe/Dublin` timezone. Rain sensor
zero readings mean **nothing measurable detected**, not necessarily no rain.
Local sea temperatures are estimates, not Poulshone water measurements.

See `DATA-DEFINITIONS.md` for site-wide labels and source semantics.
