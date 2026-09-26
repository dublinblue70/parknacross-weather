(() => {
  const usable = v => v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v));
  const formatGap = minutes => {
    if (!usable(minutes)) return "--";
    const n = Number(minutes);
    if (n < 60) return `${n.toFixed(1).replace(/\.0$/, "")} min`;
    const total = Math.round(n);
    const h = Math.floor(total / 60);
    const m = total % 60;
    return m ? `${h}h ${m}m` : `${h}h`;
  };

  document.addEventListener("DOMContentLoaded", () => {
    const c = window.PARKNACROSS_CONFIG || {};
    const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };

    async function loadQuality() {
      try {
        const [qualityResponse,reliabilityResponse,lightningResponse] = await Promise.all([
          fetch(`${c.apiBase}/quality`, { cache: "no-store" }),
          fetch(`${c.apiBase}/reliability`, { cache: "no-store" }),
          fetch(`${c.apiBase}/lightning`, { cache: "no-store" })
        ]);
        if (!qualityResponse.ok) throw new Error(`HTTP ${qualityResponse.status}`);
        const q = await qualityResponse.json();
        const reliability = reliabilityResponse.ok ? await reliabilityResponse.json() : null;
        const lightning = lightningResponse.ok ? await lightningResponse.json() : null;
        set("qualityFeed", q.feed_status || "--");
        set("qualityAge", usable(q.latest_age_seconds) ? `${Math.round(Number(q.latest_age_seconds) / 60)} min since latest reading` : "Latest observation");
        set("quality24", usable(q.samples_last_24h) ? Number(q.samples_last_24h).toLocaleString("en-IE") : "--");
        set("qualityInterval", usable(q.median_interval_minutes) ? Number(q.median_interval_minutes).toFixed(1) + " min" : "--");
        set("qualityGap", formatGap(q.largest_recent_gap_minutes));
        set("qualityTotal", usable(q.total_samples) ? Number(q.total_samples).toLocaleString("en-IE") : "--");
        set("qualityBattery", q.battery_status || "--");
        set("qualityReliability", usable(reliability?.archive_reliability_percent) ? `${Number(reliability.archive_reliability_percent).toFixed(1)}%` : "--");
        const reliabilityDetail = usable(reliability?.actual_samples) && usable(reliability?.expected_samples)
          ? `${Number(reliability.actual_samples).toLocaleString("en-IE")} of ${Number(reliability.expected_samples).toLocaleString("en-IE")} expected 5-minute readings saved this month`
          : "Percentage of expected 5-minute readings successfully saved this month";
        set("qualityReliabilityNote", reliability?.label ? `${reliability.label} · ${reliabilityDetail}` : reliabilityDetail);
        if (lightning?.available) {
          const strikes = usable(lightning.strikes_today) && Number(lightning.strikes_today) >= 0
            ? Math.round(Number(lightning.strikes_today)) : null;
          const countText = strikes === null ? "strike count unavailable" : `${strikes} strike${strikes === 1 ? "" : "s"} today`;
          set("stationLightning", `Ecowitt WH57 · approximate range up to 40 km · ${countText}`);
        } else {
          set("stationLightning", "Ecowitt WH57 · approximate range up to 40 km · awaiting live readings");
        }
        if (lightning?.available) {
          window.PWAlerts?.evaluateLightning?.(lightning);
        }
      } catch (e) {
        console.warn("Station quality refresh:", e);
      }
    }

    loadQuality();
    setInterval(loadQuality, 5 * 60 * 1000);
  });
})();
