# Parknacross Weather — shared data definitions

Updated 1 November 2026. Apply these definitions consistently in the
Dashboard, Summary, Rain Centre, History, Records, reports and downloads.

| Term | Meaning |
| --- | --- |
| Current reading | The most recent fresh gateway observation, with its source timestamp. A fetch completing now does **not** make old data live. |
| Last saved observation | The latest observation persisted in the archive; distinguish it from the gateway's last receipt time. |
| No rain detected | The WS90 rain sensor registered no measurable rain in the stated interval. Light drizzle can be missed; this is not a categorical claim of dry weather. |
| Forecast rain | Met Éireann's forecast; separate from station-detected rain and radar reflections. |
| Any recorded rain | A daily recorded accumulation **greater than 0 mm**. |
| Wet day | A daily recorded total of **at least 0.2 mm** in report wet/dry classifications. |
| Dry day | A reported daily total **below 0.2 mm**, when rain data exists. Missing readings are not dry days. |
| Archived totals | Totals built from available saved readings. Unobserved intervals are gaps, never zeroes. |
| All-time record | The highest/lowest validated value over available archive coverage; do not label a selected-period high as all-time. |
| Historical photograph time | Use `captured_at` if saved, otherwise `uploaded_at`; format as Irish local time, including DST. |
| Coastal water temperature | A **modelled estimate**, not a Poulshone sea thermometer. The M2 buoy is a distinct offshore observation, not a local one. |
| Official weather warning | Met Éireann information. A failed warning feed means `unavailable`, not `no warning`. |
| Archive completeness | Ratio of saved observations to expected 5-minute slots for that Irish calendar date, including 23- and 25-hour DST dates. |

## Data sources and reconciliation

- `/current`: fresh observation and gateway/sensor measurements.
- `/daily?days=3660`: saved per-day summaries with date keys in Irish time.
- `/stats`: archive-wide records, totals and wettest-day information.
- `/rain-summary`: rain-specific live and accumulated values.
- `/coverage`: expected versus actual saved slots.
- `/met/*`, `/marine/*`: external forecast, warnings and marine values;
  never combine measurement and modelled provenance into one unlabelled figure.

For consistency tests, fetch sources close together, compare **completed**
Irish calendar dates separately from the current partial day, account for
rounding and coverage, and flag discrepancies for investigation. Do not
silently rewrite source records to match other pages.

This file documents visitor-facing definitions; it does not prove that the
current live Cloudflare deployment implements every rule identically.

## Source labels used in the interface

- **Station detected / Observed locally:** physical WS90/GW3001 or garden sensor measurements; give the actual observation time and flag stale data. Zero measured rain is not proof of no drizzle.
- **Radar echoes:** remote radar evidence of precipitation aloft or near the location, not a guaranteed observation at ground level.
- **Forecast:** model output for a future period, never presented as a station reading.
- **Estimated:** modelled local sea temperature and any derived planning index; do not call a model estimate a measured local value.
- **Rain count:** the Dashboard's "days with rain >0 mm" is an *any recorded rain* count; Monthly/Annual Reports using "wet days" refer to **≥0.2 mm**. Keep those labels distinct.
- **Exports:** every data row represents a saved observation; never invent missing slots. A full 365-day year at five-minute intervals has approximately 105,120 slots (DST and leap-year details can alter coverage); CSV preview reports the authoritative saved count.

A viewer should be able to tell whether a figure is observed, forecast, estimated, or temporarily unavailable without needing to read developer documentation.
