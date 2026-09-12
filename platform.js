(() => {
  const cfg = window.PARKNACROSS_CONFIG || {};
  const API = cfg.apiBase;
  const $ = id => document.getElementById(id);
  const set = (id, value) => { const e = $(id); if (e) e.textContent = value; };
  const n = (v, d = 1) => Number.isFinite(Number(v)) ? Number(v).toFixed(d) : "--";

  async function get(path) {
    const r = await fetch(`${API}${path}`, { cache: "no-store" });
    if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
    const j = await r.json();
    if (j?.error) throw new Error(j.error);
    return j;
  }

  async function loadContext() {
    const [currentR, officialR, climateR, eventR, verifyR] = await Promise.allSettled([
      get("/current"), get("/met/johnstown"), get("/climate-summary"),
      get("/events"), get("/forecast-verification")
    ]);

    if (currentR.status === "fulfilled" && officialR.status === "fulfilled") {
      const local = Number(currentR.value.temperature_c);
      const official = Number(officialR.value.temperature_c);
      if (Number.isFinite(local) && Number.isFinite(official)) {
        const d = local - official;
        set("contextTempDelta", `${d >= 0 ? "+" : ""}${d.toFixed(1)}°C`);
        set("contextJohnstownTemp", `Johnstown Castle ${official.toFixed(1)}°C · Parknacross ${local.toFixed(1)}°C`);
      }
    } else set("contextTempDelta", "Comparison unavailable");

    if (climateR.status === "fulfilled" && Number.isFinite(Number(climateR.value.rain_percent_of_lta_month))) {
      set("contextRainLta", `${Math.round(climateR.value.rain_percent_of_lta_month)}% of LTA`);
    } else set("contextRainLta", "Building context");

    if (eventR.status === "fulfilled" && eventR.value.events?.length) {
      const e = eventR.value.events[0];
      set("contextMilestone", e.title);
      set("contextMilestoneDetail", e.detail || "");
    }

    if (verifyR.status === "fulfilled" && verifyR.value.comparisons?.length) {
      const v = verifyR.value.comparisons[0];
      if (Number.isFinite(Number(v.high_error_c))) {
        const d = Number(v.high_error_c);
        set("contextForecastVerification", `High ${d >= 0 ? "+" : ""}${d.toFixed(1)}°C error`);
      } else set("contextForecastVerification", "Comparison available");
    }

    // Opportunistically save tomorrow's official point forecast for verification.
    get("/met/point").catch(() => {});
  }

  async function shareToday() {
    const button = $("shareTodayButton");
    if (button) button.disabled = true;
    try {
      const [c, h] = await Promise.all([get("/current"), get("/history?hours=24")]);
      const rows = h.readings || [];
      const today = rows.filter(r => {
        const d = new Date(r.received_at || r.epoch * 1000);
        const x = new Date();
        return d.toDateString() === x.toDateString();
      });
      const vals = (field) => today.map(x => Number(x[field])).filter(Number.isFinite);
      const temps = vals("temperature_c"), gusts = vals("wind_gust_kmh");
      const high = temps.length ? Math.max(...temps) : null;
      const low = temps.length ? Math.min(...temps) : null;
      const gust = gusts.length ? Math.max(...gusts) : null;

      const canvas = document.createElement("canvas");
      canvas.width = 1200; canvas.height = 630;
      const ctx = canvas.getContext("2d");
      const g = ctx.createLinearGradient(0,0,1200,630);
      g.addColorStop(0,"#07131f"); g.addColorStop(1,"#123649");
      ctx.fillStyle = g; ctx.fillRect(0,0,1200,630);

      ctx.fillStyle="#7bd7ef"; ctx.font="700 30px system-ui"; ctx.fillText("PARKNACROSS WEATHER",70,80);
      ctx.fillStyle="#9fb3c1"; ctx.font="400 24px system-ui";
      ctx.fillText(new Date().toLocaleDateString("en-IE",{weekday:"long",day:"numeric",month:"long",year:"numeric"})+" · Ardamine, Co. Wexford",70,122);
      ctx.fillStyle="#f3f8fb"; ctx.font="300 128px system-ui"; ctx.fillText(`${n(c.temperature_c)}°`,65,315);
      ctx.fillStyle="#b9ccd8"; ctx.font="500 28px system-ui"; ctx.fillText("Current temperature",75,355);

      const cards=[["HIGH",high==null?"--":high.toFixed(1)+"°C"],["LOW",low==null?"--":low.toFixed(1)+"°C"],
        ["RAIN",`${n(c.rain_daily_mm)} mm`],["PEAK GUST",gust==null?"--":gust.toFixed(1)+" km/h"]];
      cards.forEach((a,i)=>{
        const x=540+(i%2)*300,y=205+Math.floor(i/2)*150;
        ctx.fillStyle="rgba(255,255,255,.055)"; ctx.fillRect(x,y,270,125);
        ctx.fillStyle="#8fa8b7"; ctx.font="700 18px system-ui"; ctx.fillText(a[0],x+22,y+34);
        ctx.fillStyle="#f3f8fb"; ctx.font="650 33px system-ui"; ctx.fillText(a[1],x+22,y+82);
      });
      ctx.fillStyle="#78909f";ctx.font="500 20px system-ui";ctx.fillText("parknacrossweather.ie",70,580);

      const blob = await new Promise(r => canvas.toBlob(r,"image/png"));
      const file = new File([blob],"parknacross-weather-today.png",{type:"image/png"});
      if (navigator.share && navigator.canShare?.({files:[file]})) {
        await navigator.share({title:"Today in Parknacross",text:"Local weather from Parknacross Weather.",files:[file]});
      } else {
        const url=URL.createObjectURL(blob); const a=document.createElement("a");
        a.href=url;a.download=file.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
      }
    } catch(e) {
      console.warn(e);
      alert("The share card could not be created just now.");
    } finally { if (button) button.disabled=false; }
  }

  document.addEventListener("DOMContentLoaded", () => {
    loadContext();
    $("shareTodayButton")?.addEventListener("click", shareToday);
  });
})();