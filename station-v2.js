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

  document.addEventListener("DOMContentLoaded", async () => {
    const c = window.PARKNACROSS_CONFIG || {};
    const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    try {
      const q = await fetch(`${c.apiBase}/quality`, { cache: "no-store" }).then(r => r.json());
      set("qualityFeed", q.feed_status || "--");
      set("qualityAge", usable(q.latest_age_seconds) ? `${Math.round(Number(q.latest_age_seconds) / 60)} min since latest reading` : "Latest observation");
      set("quality24", usable(q.samples_last_24h) ? Number(q.samples_last_24h).toLocaleString("en-IE") : "--");
      set("qualityInterval", usable(q.median_interval_minutes) ? Number(q.median_interval_minutes).toFixed(1) + " min" : "--");
      set("qualityGap", formatGap(q.largest_recent_gap_minutes));
      set("qualityTotal", usable(q.total_samples) ? Number(q.total_samples).toLocaleString("en-IE") : "--");
      set("qualityBattery", q.battery_status || "--");
    } catch (e) { console.warn(e); }
  });
})();