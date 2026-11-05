# Parknacross Weather — shared data definitions

Updated 3 November 2026. Apply these definitions consistently in the
Dashboard, Summary, Rain Centre, History, Records, reports and downloads.

| Term | Meaning |
| --- | --- |
| Current reading | The most recent fresh gateway observation, with its source timestamp. A fetch completing now does **not** make old data live. |
| Last saved observation | The latest observation persisted in the archive; distinguish it from the gateway's last receipt time. |
| No rain detected | The primary WH40H tipping-bucket rain gauge registered no measurable rain in the stated interval. Traces below its 0.1 mm resolution can be missed; this is not proof of dry weather. |
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

## WH52 potted hydrangea context

- The Ecowitt WH52 probe is installed in compost in one outdoor **potted hydrangea**. It does not measure the acer, bays or other pots.
- Moisture bands (below 20%, 20–29%, 30–55%, above 55%) are **trial prompts only**, not validated hydrangea watering limits. Check compost 4–5 cm below the surface.
- Advice may incorporate the trend and Irish season. Missing or stale readings must not be presented as confirmation that watering is unnecessary.
- Soil conductivity is not a direct nutrient or plant-health measurement. Do not alter archived measurements to reflect planting context.

## Rain sensor changeover

- **From approximately 13:00 GMT (Irish time) on 3 November 2026, during dry conditions:** the installed Ecowitt WH40H is the selected primary *traditional tipping-bucket* rain gauge (0.1 mm resolution); the WS90 continues to provide wind, outdoor temperature/humidity, solar and UV measurements.
- **Before the change:** rainfall in the saved archive was collected from the previous rain sensing setup. Keep the original historical observations, without retrospectively attributing them to the WH40H.
- **Read-only rain-gauge audit:** The Rain Centre may calculate within-gauge counter increases on each side of approximately 13:00 GMT. These increases are not a validated daily total; sensor hardware, calibration and radio-link health cannot be established by website data alone. The audit never modifies saved observations.
- **Changeover day:** daily and cumulative figures may include readings taken across the approximately 13:00 GMT switch, so annotate comparisons involving 3 November 2026. Do not assign any portion of that day's rainfall to the WH40H without a timestamped, gauge-specific counter comparison. The new sensor does not create a new historical dataset or automatically recalibrate old rainfall readings.
- The Ecowitt API `rainfall` group is the WH40H/traditional source; `rainfall_piezo` belongs to the old WS90 rain source and must not silently replace missing WH40H data.

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

- **Station detected / Observed locally:** physical WH40H rain-gauge measurements (from 3 Nov 2026), WS90 wind/temperature/solar measurements, GW3001 pressure, or separate garden sensors; give the actual observation time and flag stale data. Zero measured rain is not proof of no drizzle.
- **Radar echoes:** remote radar evidence of precipitation aloft or near the location, not a guaranteed observation at ground level.
- **Forecast:** model output for a future period, never presented as a station reading.
- **Estimated:** modelled local sea temperature and any derived planning index; do not call a model estimate a measured local value.
- **Rain count:** the Dashboard's "days with rain >0 mm" is an *any recorded rain* count; Monthly/Annual Reports using "wet days" refer to **≥0.2 mm**. Keep those labels distinct.
- **Exports:** every data row represents a saved observation; never invent missing slots. A full 365-day year at five-minute intervals has approximately 105,120 slots (DST and leap-year details can alter coverage); CSV preview reports the authoritative saved count.

A viewer should be able to tell whether a figure is observed, forecast, estimated, or temporarily unavailable without needing to read developer documentation.
