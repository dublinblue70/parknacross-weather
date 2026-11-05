# Parknacross source release — 5 November 2026
- Website source: **38.4.243**, GitHub Pages (automatic deployment on main).
- Cloudflare Worker source: **38.4.240** at `_worker/worker.mjs`, deployed separately by the station owner.
- The two version numbers refer to different components and do not have to match.
- **Do not infer live Worker deployment from this file.** Check the actual `/site-capabilities` and `/current` endpoints, and use the admin compatibility tool.
- WH40H was selected as the primary rain gauge about **13:00 GMT on 3 November 2026 in dry conditions**. The changeover-day total remains provisional until independently reconciled.
- Rainfall feed availability is not proof that the WH40H battery, radio or tipping-bucket mechanism is functioning.
- Archived rainfall observations are not changed by this release.
- Quality gates: release tests; WCAG serious/critical issues must block the accessibility run; public monitoring must flag missing WH40H fields, missing mapping and failed archive reconciliation.
