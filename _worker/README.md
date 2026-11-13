# Cloudflare Worker deployment

`_worker/worker.mjs` is the designated Cloudflare Worker deployment source. Its source contains changes newer than the original 38.4.240 rain-gauge release; the public website currently declares release 38.4.250. **Website and Worker versions are independent**, and source changes do not prove that either has been deployed. Deploy the complete Worker only when its changes are required, preserving all existing bindings, secrets and scheduled triggers. No credential values belong in this repository.

The repository-root `worker.mjs` is an **archived snapshot**, not the live deployment source. Never paste that root-level file into Cloudflare. The single designated source is `_worker/worker.mjs`; historical copies under `history/` are reference-only and excluded from GitHub Pages.

After deployment, verify `/health`, current readings, Wexford warnings and the admin compatibility check. Warning failure must display unavailable, never an unverified all-clear.

Version 38.4.95 adds bounded per-instance throttles for photo writes and failed admin authentication (30 per minute per trusted Cloudflare client IP). These complement, rather than replace, global Cloudflare edge rate limits. Successful authentication remains available even after failed attempts. No new bindings or secrets are required. Verify the account edge configuration separately.

Version 38.4.95 removes per-observation calendar formatting from coverage and rain events, adds hourly outdoor guidance, and supports encrypted opt-in Web Push via the existing D1 binding and scheduled trigger. No new bindings, secrets or third-party service account are required. A private VAPID signing key is created once in the existing metadata table. Background subscriptions are stored separately and managed by anonymous device tokens. Deploy this Worker before enabling background alerts and the outdoor outlook. Check /coverage?days=371 and /rain-events?days=30 after deployment.


Version 38.4.237 improves the daily Facebook and X post recovery path. The scheduled Worker retries during the morning window, then every 30 minutes while either platform remains unconfirmed. It uses a fresh same-day weather observation when the 07:30 observation is too old, shows the last attempt in admin diagnostics, and adds an authenticated “Retry missing posts now” control. Successful platforms remain protected by per-network day markers. No new bindings or secrets are required. Deploy `_worker/worker.mjs` in Cloudflare as well as the GitHub Pages website; a Pages deployment alone does not activate the publishing fix.


Version 38.4.237 streams CSV downloads in bounded D1 pages instead of loading and reversing the full result set in Worker memory. This avoids resource exhaustion on 90-day and 365-day downloads. Large and custom-range exports bypass edge-cache cloning; 7- and 30-day fixed-window downloads keep their existing cache. No new bindings or secrets are required. Deploy `_worker/worker.mjs` in Cloudflare to activate the export fix; a GitHub Pages deployment alone does not update the Worker.

## WH40H primary rainfall update — 3 November 2026 (38.4.240)

The Ecowitt WH40H is installed and selected as **Traditional rain gauge** in the GW3001/Ecowitt rain priority setting. New direct gateway uploads use the traditional `rainratein` / `dailyrainin` fields; Ecowitt cloud sync uses `rainfall.rain_rate` and `rainfall.daily`. WS90 piezo fields are intentionally **not a fallback** for current rain, so a missing WH40H feed becomes unavailable rather than silently changing sensor.

**Deployment required:** GitHub Pages publishing only updates webpages. In Cloudflare Workers, replace the current script with the complete `_worker/worker.mjs`, retain existing secrets, D1 bindings and scheduled triggers, then Deploy. Verify the admin compatibility check reports Worker **38.4.240** and **WH40H primary rain source: supported**. These flags confirm the code is deployed, not physical sensor health; additionally verify a fresh `/current` rainfall reading and Ecowitt traditional rainfall values.

The archive is intentionally not rewritten: older rainfall readings retain their original instrument provenance. Daily values for **3 November 2026**, the changeover day, may span both gauges. Never treat the change as an automatic calibration of historical rainfall.

## PWSWeather HTTPS relay — v38.4.241

The Worker now posts each new scheduled Ecowitt observation to PWSWeather's HTTPS `/api/v1/submitwx` endpoint. It converts Celsius, km/h, hPa and millimetres to the imperial fields PWSWeather expects. Only a PWSWeather `success` response records that observation as sent; failures are logged and retried on the next scheduled sync.

Before deploying, add the new station API key to the Cloudflare Worker as the secret binding `PWSWEATHER_API_KEY`. The PWSWeather station ID is `PARKNACROSSWX` in the source. Keep the secret out of the repository. Then deploy the complete `_worker/worker.mjs` script, preserving existing D1 bindings, secrets and scheduled triggers. Check the Worker logs for `PWSWeather accepted observation`, then check the PWSWeather Observations and Logs tabs.


## Release verification — 6 November 2026

The public homepage, System Status and Admin pages include a `parknacross-site-version` meta tag. `public-monitor.mjs` compares each served tag with `package.json` during scheduled checks and successful Pages-deployment follow-ups. Version mismatch is a publishing or cache problem, **not** evidence the weather gateway has stopped uploading.

Release procedure:
1. Confirm GitHub Actions **Website release checks** passed, including Node regressions and Playwright browsers.
2. Confirm GitHub Pages completed its publish; then inspect homepage, System Status and Admin HTML for the release marker matching `package.json`.
3. Confirm the PWA reports the new cache version. Use normal refresh first; avoid clearing visitor notification preferences.
4. Check the live Worker `/health`, `/current`, `/soil-status`, `/marine/sea-temperature`, `/site-capabilities`, and `/rain-summary` as independent services.
5. Compare WH40H daily rainfall at the same Irish timestamp in current and archived observations; the scheduled monitor verifies that a later live total does not fall below a same-day archived total.
6. Check real external deliveries independently: PWSWeather's rendered observations and CWOP FindU reception are **not** guaranteed by a successful Worker transmit.
7. Verify degraded/offline and recovered states on a mobile PWA, including preserved notifications and cached-observation timestamps.
8. Record the GitHub website commit SHA, Worker deployment SHA, actual deployment times and GitHub Actions run URL in the release notes. Never infer live Worker deployment from GitHub Pages success.

Do not claim production sign-off until both the website and Worker telemetry (if changed) have been checked.

## WH52 first-valid archive baseline — Worker source 38.4.244

The dashboard uses `GET /soil-baseline` to determine the start of the 14-day monitoring baseline from the **earliest valid saved WH52 moisture and root-zone temperature observation**. The endpoint uses a one-hour edge cache so repeated visitors do not rescan D1. If this endpoint is missing, the dashboard explicitly displays **Baseline not verified** rather than silently using the installation date.

**This source change needs a separate Cloudflare Worker deployment.** GitHub Pages automatically publishing the dashboard does not install the new Worker route. Preserve the existing D1 binding, scheduler, secrets, Ecowitt custom upload URL and CWOP/PWSWeather integrations. Validate `/soil-baseline` after deployment and ensure `first_valid_soil_epoch` is a valid archive timestamp. Do not infer the sensor installation date from it, and do not rewrite the older archive.

## Cahore Pier water-level observations — 13 November 2026

The Sea & Swim page now provides OPW station **11061**, sensor **0001** (Cahore Pier), through `GET /marine/cahore-water-level`. The Worker fetches OPW's pre-generated one-day CSV, caches responses for 15 minutes and uses a matching 15-minute upstream cache-buster. This avoids poll-on-visit traffic and meets OPW's request not to poll more frequently than every 15 minutes. Observations older than 90 minutes are **not** shown as current; missing and invalid data show unavailable. The 24-hour graph displays measured readings and rising/falling trend only when the most recent measurement is current.

These are heights above the **local staff-gauge zero**, NOT chart datum or Malin OD heights, and cannot be directly compared with Arklow's predicted tide heights. The website includes the required CC BY 4.0 attribution and OPW disclaimer link.

**Separate deployment required:** the GitHub Pages change alone cannot activate the new API. Replace the Cloudflare Worker with the complete designated `_worker/worker.mjs` source, retaining existing bindings, secrets, schedules, rain integration and all other endpoints. Afterwards verify `/marine/cahore-water-level` returns `status: ok` only with a recent `observed_at`, `water_level_m`, and `readings`; test stale/unavailable UI without asserting a misleading 'live' value. OPW asks automated users as a courtesy to notify waterlevel@opw.ie of the access, server IP and site URL.
