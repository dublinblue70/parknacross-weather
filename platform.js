(() => {
  const cfg = window.PARKNACROSS_CONFIG || {};
  const API = cfg.apiBase;
  const $ = id => document.getElementById(id);
  const set = (id, value) => { const e = $(id); if (e) e.textContent = value; };
  const usable = v => v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v));
  const n = (v, d = 1) => usable(v) ? Number(v).toFixed(d) : "--";
  const STATION_TIME_ZONE = "Europe/Dublin";
  const stationDayKey = value => {
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    const parts = new Intl.DateTimeFormat("en-GB", {timeZone:STATION_TIME_ZONE,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(d);
    const map = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return `${map.year}-${map.month}-${map.day}`;
  };
  const dayLabel = day => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(day || ""))) return "--";
    return new Date(`${day}T12:00:00Z`).toLocaleDateString("en-IE", {
      timeZone: STATION_TIME_ZONE, day: "numeric", month: "short"
    });
  };

  async function get(path) {
    const r = await fetch(`${API}${path}`, { cache: "no-store" });
    if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
    const j = await r.json();
    if (j?.error) throw new Error(j.error);
    return j;
  }

  const MAX_LOCAL_AGE_MS = 15 * 60 * 1000;
  const MAX_REPORT_AGE_MS = 2 * 60 * 60 * 1000;
  const ageFrom = raw => {
    if (raw === null || raw === undefined || raw === "") return null;
    const parsed = typeof raw === "number" || /^\d{10,13}$/.test(String(raw))
      ? new Date(Number(raw) < 1e12 ? Number(raw) * 1000 : Number(raw))
      : new Date(raw);
    const age = Date.now() - parsed.getTime();
    return Number.isFinite(age) && age >= -5*60*1000 ? age : null;
  };
  const reportClock = raw => new Date(raw).toLocaleString("en-IE", {
    timeZone: STATION_TIME_ZONE, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit"
  });

  async function loadContext() {
    const [currentR, officialR, climateR, rainR, eventR, verifyR, storageR] = await Promise.allSettled([
      get("/current"), get("/met/johnstown"), get("/climate-summary"), get("/rain-summary"),
      get("/events"), get("/forecast-verification"), get("/storage-stats")
    ]);

    // Compare recent observations only. The Met heading is a *report* time;
    // individual station measurements may be earlier. Never treat fetch time
    // as the observation time or present an unverified difference as live.
    if (currentR.status === "fulfilled" && officialR.status === "fulfilled") {
      const local = usable(currentR.value.temperature_c) ? Number(currentR.value.temperature_c) : null;
      const official = usable(officialR.value.temperature_c) ? Number(officialR.value.temperature_c) : null;
      const localRawTime = currentR.value.received_at ?? currentR.value.timestamp ?? currentR.value.epoch;
      const officialRawTime = officialR.value.report_time;
      const localAge = ageFrom(localRawTime), reportAge = ageFrom(officialRawTime);
      if (local !== null && official !== null && localAge !== null &&
          localAge <= MAX_LOCAL_AGE_MS && reportAge !== null && reportAge <= MAX_REPORT_AGE_MS) {
        const d = local - official;
        set("contextTempDelta", `${d >= 0 ? "+" : ""}${d.toFixed(1)}°C`);
        set("contextJohnstownTemp", `Johnstown Castle ${official.toFixed(1)}°C · Parknacross ${local.toFixed(1)}°C · Met report ${reportClock(officialRawTime)} (station reading may be older)`);
      } else {
        set("contextTempDelta", "Comparison unavailable");
        set("contextJohnstownTemp", reportAge === null
          ? "Met report time unavailable; temperature difference withheld."
          : reportAge > MAX_REPORT_AGE_MS
            ? `Official report is old (${reportClock(officialRawTime)}); difference withheld.`
            : "A recent local reading is unavailable; difference withheld.");
      }
    } else {
      set("contextTempDelta", "Comparison unavailable");
      set("contextJohnstownTemp", "One or both weather data sources are unavailable.");
    }

    if (climateR.status === "fulfilled") {
      const monthName = new Intl.DateTimeFormat("en-IE", {timeZone:STATION_TIME_ZONE, month:"long"}).format(new Date());
      set("contextRainHeading", `${monthName} rainfall so far`);
      const stationMonthRain = rainR.status === "fulfilled" && usable(rainR.value?.month_mm) ? Number(rainR.value.month_mm) : usable(climateR.value.station_month_rain_mm) ? Number(climateR.value.station_month_rain_mm) : null;
      const ltaMonthRain = usable(climateR.value.johnstown_lta_month_rain_mm) ? Number(climateR.value.johnstown_lta_month_rain_mm) : null;
      const rainPct = stationMonthRain !== null && ltaMonthRain !== null && ltaMonthRain > 0
        ? (stationMonthRain / ltaMonthRain) * 100
        : usable(climateR.value.rain_percent_of_lta_month) ? Number(climateR.value.rain_percent_of_lta_month) : null;
      if (rainPct !== null) {
        set("contextRainLta", `${Math.round(rainPct)}% of monthly average`);
        const firstEpoch = storageR.status === "fulfilled" && usable(storageR.value.first_epoch)
          ? Number(storageR.value.first_epoch) : null;
        const firstDate = firstEpoch !== null ? new Date(firstEpoch * 1000) : null;
        const monthKey = stationDayKey(new Date())?.slice(0, 7);
        const archiveStartedThisMonth = firstDate && stationDayKey(firstDate)?.slice(0, 7) === monthKey;
        const startLabel = archiveStartedThisMonth
          ? `since ${firstDate.toLocaleDateString("en-IE", {timeZone:STATION_TIME_ZONE,day:"numeric",month:"short"})}`
          : "so far this month";
        set("contextRainDetail", `Station rainfall ${startLabel}, compared with Johnstown Castle's FULL-MONTH ${monthName} average (1991–2020). This is not a same-date rainfall comparison.`);
      } else {
        set("contextRainLta", "Monthly average unavailable");
        set("contextRainDetail", `The usual rainfall for ${monthName} is not available yet.`);
      }
    } else {
      set("contextRainLta", "Building context");
    }

    if (eventR.status === "fulfilled" && eventR.value.events?.length) {
      const e = eventR.value.events[0];
      set("contextMilestone", e.title);
      set("contextMilestoneDetail", e.detail || "");
    }

    if (verifyR.status === "fulfilled") {
      const verification = verifyR.value || {};
      if (verification.comparisons?.length) {
        const v = verification.comparisons[0];
        if (usable(v.high_error_c)) {
          const d = Number(v.high_error_c);
          set("contextForecastVerification", `High ${d >= 0 ? "+" : ""}${d.toFixed(1)}°C error`);
        } else {
          set("contextForecastVerification", "Comparison available");
        }
        set("contextForecastVerificationDetail", `${dayLabel(v.target_day)} · morning forecast compared with completed Parknacross observations.`);
      } else if (verification.pending?.length) {
        const p = verification.pending[0];
        set("contextForecastVerification", `Snapshot captured for ${dayLabel(p.target_day)}`);
        set("contextForecastVerificationDetail", "Awaiting the completed Parknacross day before calculating forecast error.");
      } else {
        set("contextForecastVerification", "Awaiting first morning snapshot");
        set("contextForecastVerificationDetail", `Next capture window ${verification.capture_window_local || "07:00–10:00 Europe/Dublin"} · forecast target ${dayLabel(verification.next_target_day)}.`);
      }
    } else {
      set("contextForecastVerification", "Verification temporarily unavailable");
      set("contextForecastVerificationDetail", "Forecast comparison is temporarily unavailable.");
    }

    // Forecast snapshots are captured by the scheduled Worker only.
  }

  function shareSummary(current, high, low, rain, gust) {
    const temp = usable(current?.temperature_c) ? Number(current.temperature_c) : null;
    const dewPoint = usable(current?.dew_point_c) ? Number(current.dew_point_c) : null;
    const words = [];
    if (temp !== null) words.push(temp >= 20 ? "Mild" : temp >= 15 ? "Cool" : "Fresh");
    if (dewPoint !== null && dewPoint >= 18) words.push(dewPoint >= 20 ? "very muggy" : "muggy");
    if (gust !== null && gust >= 40) words.push("windy");
    else if (usable(current?.wind_speed_kmh) && Number(current.wind_speed_kmh) >= 20) words.push("breezy");
    const lead = words.length ? words.join(" and ") : "Local conditions";
    const details = [];
    if (rain !== null) details.push(`${rain.toFixed(1)} mm rain today`);
    if (gust !== null) details.push(`peak gust ${gust.toFixed(1)} km/h`);
    if (high !== null && low !== null) details.push(`high/low ${high.toFixed(1)}°/${low.toFixed(1)}°`);
    return `${lead} · ${details.slice(0,2).join(" · ")}`;
  }

  async function shareToday() {
    const button = $("shareTodayButton");
    if (button) button.disabled = true;
    try {
      const [c, h, rainSummary, daily] = await Promise.all([
        get("/current"),
        get("/history?hours=24"),
        get("/rain-summary"),
        get("/daily?days=2")
      ]);
      const rows = h.readings || [];
      const todayKey = stationDayKey(new Date());
      const today = rows.filter(r =>
        stationDayKey(new Date(r.received_at || r.epoch * 1000)) === todayKey
      );
      const currentIsToday = stationDayKey(new Date(c.received_at || Number(c.epoch) * 1000)) === todayKey;
      const mergedToday = currentIsToday ? [...today.filter(r => Number(r.epoch) !== Number(c.epoch)), c] : today;
      const vals = field => mergedToday.filter(x => usable(x[field])).map(x => Number(x[field]));
      const temps = vals("temperature_c"), gusts = vals("wind_gust_kmh");
      const high = temps.length ? Math.max(...temps) : null;
      const low = temps.length ? Math.min(...temps) : null;
      const gust = gusts.length ? Math.max(...gusts) : null;
      const rain = usable(rainSummary?.today_mm)
        ? Number(rainSummary.today_mm)
        : usable(c.rain_daily_mm) ? Number(c.rain_daily_mm) : null;
      const summary = shareSummary(c, high, low, rain, gust);

      const previous = Array.isArray(daily?.days)
        ? daily.days.find(row => row.day && row.day !== todayKey)
        : null;
      const comparison = usable(high) && usable(previous?.high_c)
        ? `${Math.abs(high - Number(previous.high_c)).toFixed(1)}°C ${high >= Number(previous.high_c) ? "warmer" : "cooler"} than yesterday's high`
        : "";

      const canvas = document.createElement("canvas");
      canvas.width = 1200; canvas.height = 630;
      const ctx = canvas.getContext("2d");
      const g = ctx.createLinearGradient(0,0,1200,630);
      g.addColorStop(0,"#07131f"); g.addColorStop(1,"#123649");
      ctx.fillStyle = g; ctx.fillRect(0,0,1200,630);

      ctx.fillStyle="#7bd7ef"; ctx.font="700 30px system-ui"; ctx.fillText("PARKNACROSS WEATHER",70,76);
      ctx.fillStyle="#9fb3c1"; ctx.font="400 23px system-ui";
      ctx.fillText(new Date().toLocaleDateString("en-IE",{timeZone:STATION_TIME_ZONE,weekday:"long",day:"numeric",month:"long",year:"numeric"})+" · Ardamine, Co. Wexford",70,116);

      ctx.fillStyle="#f3f8fb"; ctx.font="300 126px system-ui"; ctx.fillText(`${n(c.temperature_c)}°`,65,300);
      ctx.fillStyle="#b9ccd8"; ctx.font="500 27px system-ui"; ctx.fillText("Current temperature",75,340);

      const cards=[
        ["HIGH",high==null?"--":high.toFixed(1)+"°C"],
        ["LOW",low==null?"--":low.toFixed(1)+"°C"],
        ["RAIN",rain==null?"--":rain.toFixed(1)+" mm"],
        ["PEAK GUST",gust==null?"--":gust.toFixed(1)+" km/h"]
      ];
      cards.forEach((a,i)=>{
        const x=540+(i%2)*300,y=180+Math.floor(i/2)*145;
        ctx.fillStyle="rgba(255,255,255,.055)";
        if (typeof ctx.roundRect === "function") {
          ctx.beginPath();ctx.roundRect(x,y,270,120,16);ctx.fill();
        } else ctx.fillRect(x,y,270,120);
        ctx.fillStyle="#8fa8b7";ctx.font="700 18px system-ui";ctx.fillText(a[0],x+22,y+34);
        ctx.fillStyle="#f3f8fb";ctx.font="650 32px system-ui";ctx.fillText(a[1],x+22,y+79);
      });

      ctx.fillStyle="#dbeaf2";ctx.font="600 28px system-ui";
      ctx.fillText(summary.slice(0,75),70,462);
      if (comparison) {
        ctx.fillStyle="#9fb3c1";ctx.font="500 22px system-ui";ctx.fillText(comparison,70,500);
      }

      ctx.fillStyle="#78909f";ctx.font="500 20px system-ui";
      ctx.fillText("Independent personal weather station · parknacrossweather.ie",70,580);

      const blob = await new Promise(r => canvas.toBlob(r,"image/png"));
      if (!blob) throw new Error("Could not create PNG");
      const file = new File([blob],"parknacross-weather-today.png",{type:"image/png"});
      if (navigator.share && navigator.canShare?.({files:[file]})) {
        await navigator.share({
          title:"Parknacross Weather today",
          text:`${summary}. parknacrossweather.ie`,
          files:[file]
        });
      } else {
        const url=URL.createObjectURL(blob);
        const a=document.createElement("a");
        a.href=url;a.download=file.name;a.click();
        setTimeout(()=>URL.revokeObjectURL(url),1000);
      }
    } catch(e) {
      console.warn(e);
      alert("The share card could not be created just now.");
    } finally {
      if (button) button.disabled=false;
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    loadContext();
    setInterval(loadContext, 5 * 60 * 1000);
    $("shareTodayButton")?.addEventListener("click", shareToday);
  });
})();