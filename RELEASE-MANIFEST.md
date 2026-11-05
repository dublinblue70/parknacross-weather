# Parknacross source release — 5 November 2026
- Website source: **38.4.246**, GitHub Pages (automatic deployment on main).
- Cloudflare Worker source: **38.4.240** at `_worker/worker.mjs`, deployed separately by the station owner.
- The two version numbers refer to different components and do not have to match.
- **Do not infer live Worker deployment from this file.** Check the actual `/site-capabilities` and `/current` endpoints, and use the admin compatibility tool.
- WH40H was selected as the primary rain gauge about **13:00 GMT on 3 November 2026 in dry conditions**. The changeover-day total remains provisional until independently reconciled.
- Rainfall feed availability is not proof that the WH40H battery, radio or tipping-bucket mechanism is functioning.
- Archived rainfall observations are not changed by this release.
- Quality gates: release tests; WCAG serious/critical issues must block the accessibility run; public monitoring must flag missing WH40H fields, missing mapping and failed archive reconciliation.

## 38.4.244 — Dashboard and rainfall verification
- Dashboard prioritises live observations and the local forecast ahead of optional outdoor-planning widgets.
- Rain Centre includes a read-only analysis of counter movements on each side of approximately 13:00 GMT on 3 November, with gaps/resets highlighted.
- Counter movement is not physical verification of the tipping bucket or a corrected, independently calibrated daily total.
- Cloudflare Worker, gateway and archived readings have not been changed; changeover-day totals remain provisional.

## 38.4.245 — Dashboard release-test repairs
- Clear legacy flex ordering on both dashboard direct children and the `display: contents` customisation host; the section order shown to visitors matches the DOM and default layout.
- Default layout: Today at a glance → Station readings → Ardamine forecast, ahead of optional planning widgets. Existing visitor-defined section arrangements remain respected.
- Validate the six Dashboard shortcut links in three balanced mobile rows rather than an obsolete five-link layout.
- Bump static-asset query versions and the service-worker cache release to ensure the repaired CSS/JS reaches installed devices.

## 38.4.246 — Potted hydrangea soil guide
- The WH52 is identified as being installed in a hydrangea flowerpot on the Dashboard, Summary and Station pages.
- Dashboard and Summary provide provisional watering advice combining the current moisture value, available trend and season. Stale or missing observations must not imply that watering is unnecessary.
- Tentative moisture categories are not calibrated plant-care targets: check compost 4–5 cm below the surface and ensure drainage.
- Cloudflare Worker code, sensor settings and historical weather observations remain unchanged.
