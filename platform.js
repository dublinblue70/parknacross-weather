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
  async function get(path) {
    const r = await fetch(`${API}${path}`, { cache: "no-store" });
    if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
    const j = await r.json();
    if (j?.error) throw new Error(j.error);
    return j;
  }

  async function loadContext() {
    const [currentR,rainR,eventR,storageR] = await Promise.allSettled([
      get("/current"),get("/rain-summary"),get("/events"),get("/storage-stats")
    ]);
    const current=currentR.status==="fulfilled"?currentR.value:null;
    const received=current?.received_at ? Date.parse(current.received_at) : Number(current?.epoch)*1000;
    const isFresh=Number.isFinite(received)&&received<=Date.now()+90000&&Date.now()-received<=600000;
    set("contextCurrentTemp",isFresh&&usable(current?.temperature_c)?`${n(current.temperature_c)} °C`:"Unavailable");
    set("contextCurrentNote",isFresh?"Latest Parknacross observation · "+new Date(received).toLocaleString("en-IE",{timeZone:STATION_TIME_ZONE,day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}):"Fresh station observation unavailable");
    const monthName=new Intl.DateTimeFormat("en-IE",{timeZone:STATION_TIME_ZONE,month:"long"}).format(new Date());
    set("contextRainHeading",`${monthName} rainfall at Parknacross`);
    const monthly=rainR.status==="fulfilled"&&usable(rainR.value?.month_mm)?Number(rainR.value.month_mm):null;
    set("contextRainLta",monthly!==null?`${n(monthly)} mm`:"Unavailable");
    set("contextRainDetail",monthly!==null?"Measured at Parknacross so far this month · month still in progress":"Current station monthly total unavailable");

    if (eventR.status === "fulfilled" && eventR.value.events?.length) {
      const e = eventR.value.events[0];
      const rainfallMilestone = e.type === "rain" && ["Wet day", "Very wet day"].includes(e.title);
      const title = rainfallMilestone
        ? `Most recent day with ${e.title === "Very wet day" ? "25" : "10"} mm+ rain`
        : e.title === "Wettest day in the archive" ? "Highest daily rainfall recorded" : e.title;
      set("contextMilestone", title);
      const rawDate = e.received_at || (usable(e.epoch) ? Number(e.epoch)*1000 : undefined);
      const day = /^\d{4}-\d{2}-\d{2}$/.test(e.day || "") ? e.day : rawDate === undefined ? null : stationDayKey(rawDate);
      const when = day ? new Date(day+"T12:00:00Z").toLocaleDateString("en-IE",{timeZone:STATION_TIME_ZONE,day:"numeric",month:"long",year:"numeric"}) : "Date unavailable";
      set("contextMilestoneDetail", [when,e.detail,rainfallMilestone ? "Daily total · archived observation" : null].filter(Boolean).join(" · "));
    }

    if (storageR.status === "fulfilled") {
      const total = usable(storageR.value.total_samples) ? Number(storageR.value.total_samples) : null;
      const firstEpoch = usable(storageR.value.first_epoch) ? Number(storageR.value.first_epoch) : null;
      set("contextArchiveCount", total === null ? "Archive growing" : `${total.toLocaleString("en-IE")} observations`);
      set("contextArchiveDetail", firstEpoch === null
        ? "Saved observations are available in History."
        : `Saved since ${new Date(firstEpoch * 1000).toLocaleDateString("en-IE", {timeZone:STATION_TIME_ZONE,day:"numeric",month:"short",year:"numeric"})}.`);
    } else {
      set("contextArchiveCount", "Archive available");
      set("contextArchiveDetail", "Open History to explore saved observations.");
    }
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
    (window.ParknacrossRefresh?.every || setInterval)(loadContext, 5 * 60 * 1000);
    /* app.js exclusively owns the weather-card button. Do not attach the
       retired platform card generator here: two click handlers can create a
       valid card and then show a false failure from the second attempt. */
  });
})();

