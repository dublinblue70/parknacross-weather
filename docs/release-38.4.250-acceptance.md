# Parknacross Weather: final acceptance and safe refactoring map

**Website source:** 38.4.250  
**Cloudflare Worker source:** 38.4.244 (deployment must be checked separately)

## Architecture boundaries

- `index.html`, `app.js`, `dashboard-ui.js`, `site-polish.css`: live visitor dashboard and presentation
- `summary.js`, `rain.js`, `graphs.js`, `history.js`, `coast.js`: page-specific presentation, weather interpretation and archives
- `status.js` + `status-ui.js`: read-only service checks and health presentation
- `public-monitor.mjs`: network health, published-version comparison, WH40H live/archive reconciliation
- `_worker/worker.mjs`: **single deployed Cloudflare entry point** containing read routes, ingestion, D1 access, R2 photographs, external network relays and scheduled tasks
- `service-worker.js`: offline static asset cache, navigation fallback and push handling

## Safe refactoring sequence

The Worker is deliberately kept as a single deployable file while the operator deploys by replacing its source in Cloudflare's editor. Splitting this into imports without bundling would break that deployment process. Before modularising the Worker, introduce a bundler that generates **one verified deployable Worker file** with its existing binding names and handlers intact. Move pure calculations first; leave D1 schema and network protocol changes for separately reviewed releases.

The first extracted, independently tested behaviours are M2 freshness classification and WH52 archive baseline handling. Further candidates for isolated modules are rainfall normalisation, the five-minute archive writer and external-network serialisation. Each move must preserve endpoints, scheduled triggers, security checks, rate limits and historical D1 records.

## Release acceptance — evidence needed

1. GitHub Actions **Website release checks** must pass, including Node regression tests, Chromium/WebKit visual tests and PWA tests.
2. Confirm the published homepage, System Status and Admin HTML all declare the same `parknacross-site-version` as `package.json`.
3. Verify the Worker source has been deployed separately and that `GET /soil-baseline` returns the first valid archived soil timestamp. Its response is edge-cached for 3600 seconds.
4. Compare current and archived WH40H rainfall at the same Irish observation time. Distinguish HTTP acknowledgement from rendered values on third-party networks.
5. Independently confirm PWSWeather's displayed observation date/rainfall and CWOP's FindU reception. A successful Worker TCP write **does not** establish CWOP activation or visible upload acceptance.
6. Test WH52 absent, stale, recovered and first-baseline states. Test M2 freshness, missing data, future timestamps and recovery.
7. Test alerts and notification preferences on installed Android/iOS PWAs after an update and an offline restart.
8. Review release-test screenshots and JSON performance reports, including keyboard focus, button names, image alternatives and horizontal overflow.
9. Test screen-reader interaction, zoom, contrast and reduced-motion behaviour on actual user devices; automated checks do not establish full WCAG compliance.
10. Review Cloudflare secrets, dashboard permissions, edge rate limits and deployed CORS/security settings; static route-auth regression checks are not a penetration test.
11. Record the website commit SHA, the deployed Worker SHA and deployment timestamps, and the GitHub Actions run URL.

## Known limits of the automated report

The browser suite measures first-contentful-paint, laboratory LCP/CLS approximations, resource count and layout stability against a local test server. These are **not real-user Core Web Vitals**; use production field data or a trusted PageSpeed report for that determination.

The public monitor checks the **deployed** website and Worker, and reports missing endpoints or rain discrepancies. It cannot prove the receiving PWSWeather or CWOP pages have accepted and displayed uploaded observations. The existing Station page has links for manual independent review.

Do not mark the release fully signed off solely because code was committed.
