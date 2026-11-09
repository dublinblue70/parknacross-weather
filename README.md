## Premium SVG icon system (9 November 2026)

The site uses a small reusable, first-party icon library:
`weather-icons.js` creates decorative, accessible inline SVG weather glyphs;
`weather-icons.css` provides the same restrained coastal styling and mobile
sizes across the Dashboard, Station, Graphs, Rain, Sea & Swim, System Status,
Summary, Today’s Sky and Downloads pages. Each of these nine pages imports
both versioned assets. The PWA service worker precaches them.

All icons are `aria-hidden`, with their original text labels still visible.
Existing hand-drawn dashboard metric SVGs, data plots, external network logos
and live System Status state badges are not replaced. The script runs once
after DOM parsing, does not alter live measurements, and does not make any
network requests. New page sections can opt into an existing icon in the
page-specific selectors of `weather-icons.js`.

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


## WOW-BE (Royal Meteorological Institute of Belgium) — Parknacross

The owner has registered Parknacross on the new WOW-BE platform, with short
station ID **`d8bbdb70`**. The email registration also supplies an authentication
key. **Never put that key in GitHub, source files, public diagnostics or URLs.**

The authoritative Worker at `_worker/worker.mjs` now has an opt-in WOW-BE
Weather Underground-protocol publisher. It forwards outdoor observations from
the existing GW3001 direct-ingestion pipeline, with an Ecowitt cloud fallback,
without changing the GW3001 Customized/DIY Upload Server configuration.
It uses HTTPS POST JSON to
`https://wow.meteo.be/api/v2/send/weatherunderground`.

**Enable in Cloudflare only after deploying the updated Worker:**

- Add `WOWBE_AUTH_KEY` as a **secret**, with the personal WOW-BE station
  authentication key from the registration email (not the Ecowitt password).
- Add `WOWBE_ENABLED` as a **text variable** with value `true`.
- Preserve the existing Worker D1/R2 bindings, gateway ingress secret,
  cron trigger, and all other network credentials.

The exporter sends at approximately 60-second observation intervals; it
rejects missing/stale data and skips successful duplicate observations.
It converts temperatures to °F, wind from km/h to mph, relative sea-level
pressure from hPa to inHg, and the **WH40H rain rate** from mm/h to inches/hour
(the `rainin` parameter on WOW-BE denotes *intensity*, not the WU-style
hourly accumulation). It excludes all indoor and soil readings.

**Verification:** after the updated Worker is deployed, GET
`/wowbe-status` and visit `status.html#wowbeHealth`. The endpoint reports
whether the key is configured and uploads are enabled, the latest observation
epoch, an HTTP acknowledgement or a safe error code, and the outdoor values
sent. `accepted_not_display_verified` means the server acknowledged receipt;
it does not independently prove the report is shown on WOW-BE's public map.
Confirm visibility from the station dashboard at
https://wow.meteo.be/web/login .

Official guide: https://wow.meteo.be/en/join/ .

## Windguru station 16733 — ParknacrossWX

The authoritative Cloudflare Worker source now contains an **opt-in** Windguru
Upload API exporter for station **16733**, with registration UID
`FZ3RESA2VHEG` and five-minute scheduled reporting. It uses validated
Ecowitt GW3001 observations and does not change any existing gateway uploads.

**Prerequisites for going live** (the GitHub update does not deploy Cloudflare):
1. Verify that Windguru station 16733 is authorised to receive uploads through
   the Windguru Upload API. Windguru's API documentation specifies the station
   type **Other (upload API)**, whereas the registered station currently shows
   **Fine offset clones**. If Windguru rejects this UID, ask Windguru how to
   enable API uploads for this registered station before changing registration.
2. In the live Cloudflare Worker, add secret `WINDGURU_UPLOAD_PASSWORD` containing
   your **Windguru station password or dedicated upload API password**. Never
   put it in the GitHub repository or in a browser URL. The station's numeric ID
   is NOT the password.
3. Add Worker environment variable `WINDGURU_ENABLED=true`. The uploader
   is disabled by default. Preserve all existing secrets, D1 bindings and
   cron schedules when deploying `_worker/worker.mjs`.

**Update-alignment improvement (9 November 2026):** After a successful
GW3001 direct-upload archive write, the Worker now relays the same validated
observation to Windguru using `ctx.waitUntil`, without holding up the gateway
response. It limits successful uploads to approximately once per minute
(55-second minimum separation), retaining the five-minute Ecowitt cron as
fallback. The `/windguru-status` response includes the actual values sent in
`last_attempt.sent_readings`, along with the sample source and observation
epoch. Compare with Parknacross `/current` at **the same observation time**.
Windguru's API requires wind speeds in **knots**, so the relay intentionally
converts the website's km/h readings by dividing by 1.852. Windguru's display
may round or resample values. This improvement needs a fresh Cloudflare
deployment of `_worker/worker.mjs`; editing GitHub alone does not activate it.

The exporter sends current data to the official Windguru upload endpoint
over HTTPS, signing each request with MD5(salt + UID + password) using a new
salt. Wind speeds are converted from km/h into knots; temperature uses Celsius,
relative humidity percentage and relative pressure hPa. WH40H rainfall
increments are included only where same-day archived totals can be safely
compared; missing rainfall is omitted. Observations older than 15 minutes
and duplicate successful uploads are skipped. Upload errors are independent
of CWOP and PWSWeather.

Check `/windguru-status` and the Windguru panel on `status.html` for
configuration status and the last server acknowledgement. HTTP acknowledgement
is **not** proof that data appear on the public Windguru station page:
https://www.windguru.cz/station/16733 .

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
