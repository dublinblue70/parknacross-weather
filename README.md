# Parknacross Weather — deployment and maintenance

Website: https://parknacrossweather.ie · GitHub Pages (main branch)
Site release: see `package.json` and the active `service-worker.js` cache name.

## Cloudflare Worker — authoritative source

**Use `_worker/worker.mjs` as the current Worker source for new deployments.** The root-level `worker.mjs` begins with a DO NOT DEPLOY warning; it exists solely for historical comparison. Do not use the archived version in Cloudflare.
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


## CWOP / FindU — GW8205

The authoritative Worker source includes an **opt-in** five-minute CWOP APRS-IS uploader.
It uses the existing Ecowitt observation synchronisation and sends over outbound
TCP to `cwop.aprs.net:14580`. PWSWeather, Weather Underground and ingestion
are unaffected.

**Before deploying:** confirm the Worker source is compatible with Cloudflare's
`cloudflare:sockets` module import, retain all current bindings, schedules and
secrets, and run the normal release checks. Updating this GitHub file does not
deploy the live Worker. Once the Worker is deployed, set its environment variables:

- `CWOP_LATITUDE`: the **exact** latitude of the physically installed weather station, as a signed decimal degree.
- `CWOP_LONGITUDE`: the **exact** longitude of the physically installed weather station, as a signed decimal degree (west is negative).
- `CWOP_ENABLED`: `true` **only after** validating both coordinates and the gateway observations.

The uploader is disabled by default. Do not use the approximate Met Éireann
forecast coordinates as the CWOP station location. The supplied CWOP welcome
email contains no latitude/longitude.

View the read-only `/cwop-status` endpoint and the CWOP panel on
`status.html`. A status of `sent_unverified` means the APRS packet was
written to the TCP connection, **not** that FindU accepted or displayed it.
Verify the station at
http://www.findu.com/cgi-bin/wx.cgi?call=GW8205
before replying to CWOP Support for activation.

Rain is sourced only from the WH40H daily rainfall values (the archived daily
summary is preferred). Rolling one-hour and 24-hour rain require historical
cumulative observations near the relevant window boundary; unavailable values
are transmitted as unknown (`...`), never invented as zero. Reports older
than 15 minutes are rejected. Each archived epoch is sent at most once after
a successful TCP write. Errors are logged separately from PWSWeather.

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
