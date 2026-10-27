# Whole-site update — 38.4.232

The warning recovery fix is independently published in 38.4.231. It verifies the official Weather Warnings section and handles Northern Ireland-only bulletins without reporting a Wexford feed outage. The browser can read the official bulletin when the API fails.

This update also implements radar-image-age correction and background motion analysis; stale coastal observation rejection; overnight forecast grouping; notification subscription reconciliation; consistent rainfall definitions; progressive dashboard panels; shared responsive alignment; equal-height fingerprint months; accessible chart tables; preference export/import; day replay and observed-event timelines; rain-to-soil comparisons; daylight activity planning; live local landing-page widgets; offline observation age; updated maintenance entries; and broader feature monitoring.

The data-service changes add photo galleries, selected CSV fields with streamed responses, historical annual coverage, public feature capabilities and an authenticated exposure-history editor. The browser keeps column selection disabled and explains unavailable gallery/log features until those capabilities are deployed. The existing CSV download, latest-photo viewer and custom record-period comparison remain available.

## Verification

Run `npm run test:smoke`, `npm run test:release`, `npm run test:worker-export-range`, `npm run test:release-browser` and `npm run test:pwa-browser`. The release browser suite covers Chromium and WebKit and includes phone, tablet and laptop layouts. Run `npm run test:backup-restore` for the isolated backup restoration fixture.

For an actual backup drill, obtain a completed daily CSV from the configured backup destination and run `python3 tools/verify-backup.py /path/to/daily.csv --day YYYY-MM-DD`. It restores into temporary SQLite, checks rows, timestamps, unique slots and integrity, and never changes production data. This fixture does not prove that a live R2 object has been restored.

## Deployment-dependent work

GitHub Pages publishes the browser changes. The updated `_worker/worker.mjs` must also be deployed to the existing Cloudflare Worker to activate its new capabilities. Preserve its D1/R2 bindings, secrets and schedules. Cloudflare authentication was unavailable during implementation.

The historical mounting position and move dates require confirmed information; no installation dates or wind correction multipliers have been invented. A permanent HTTP redirect for the legacy Intelligence URL requires hosting support beyond GitHub Pages; its existing working redirect is retained. Physical-device push delivery and a live backup restoration remain operational checks.
