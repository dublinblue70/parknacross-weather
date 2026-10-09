(() => {
  "use strict";

  const scene = document.getElementById("weatherWindowScene");
  const observation = document.getElementById("weatherWindowObservation");
  const windValue = document.getElementById("weatherWindowWind");
  const rainValue = document.getElementById("weatherWindowRain");
  const solarValue = document.getElementById("weatherWindowSolar");
  if (!scene || !observation) return;

  const directions = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  const numberOrNull = value => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value)) ? Number(value) : null;
  const format = (value, digits = 1) => numberOrNull(value) === null ? "Unavailable" : Number(value).toFixed(digits);

  function compass(degrees) {
    const value = numberOrNull(degrees);
    return value === null ? null : directions[Math.round(((value % 360) + 360) % 360 / 22.5) % 16];
  }

  function stamp(epoch) {
    const value = numberOrNull(epoch);
    if (value === null) return "Time unavailable";
    const date = new Date(value * 1000);
    if (!Number.isFinite(date.getTime())) return "Time unavailable";
    return date.toLocaleString("en-IE", { timeZone: "Europe/Dublin", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  }

  let latestDetail = null, forecast = null, pointForecast = null, skyOverride = null;
  const sourceLabel = document.getElementById("weatherWindowSkySource");
  const adminControls = document.getElementById("weatherWindowSkyAdmin");
  const adminSelect = document.getElementById("weatherWindowSkySelect");
  const adminRain = document.getElementById("weatherWindowRainSelect");
  const rainLabels = {none:"No rain",light:"Light rain / drizzle",rain:"Rain",heavy:"Heavy rain",thunderstorm:"Thunder / lightning with rain"};
  function activeOverride() { return (skyOverride?.expires_at ? Date.parse(skyOverride.expires_at) > Date.now() : skyOverride?.day === clock().day) ? skyOverride : null; }
  const adminStatus = document.getElementById("weatherWindowSkyStatus");
  const apiBase = (window.PARKNACROSS_CONFIG?.apiBase || "https://parknacross-weather.dave-s-carter.workers.dev").replace(/\/$/, "");
  const skyLabels = {clear:"Clear sky", "mostly-clear":"Mostly clear sky", "partly-cloudy":"Partly cloudy sky", cloudy:"Cloudy sky", overcast:"Overcast sky", unknown:"Cloud cover unavailable"};
  function clock() {
    const values = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {timeZone:"Europe/Dublin",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",hourCycle:"h23"}).formatToParts(new Date()).map(p => [p.type,p.value]));
    return {day:`${values.year}-${values.month}-${values.day}`,hour:Number(values.hour)};
  }
  function skyState(detail) {
    const c = clock();
    const overrideActive = activeOverride();
    if (overrideActive && skyLabels[skyOverride.sky] && skyOverride.sky !== "unknown") return {...skyOverride,source:"observer"};
    const hourly = window.ParknacrossWeatherSky?.resolvePoint(pointForecast);
    if (hourly) return hourly;
    return window.ParknacrossWeatherSky?.resolve(forecast,{...c,isNight:detail.isNight}) || {sky:"unknown", source:"unavailable"};
  }
  async function refreshPointSky() {
    try {
      const response = await fetch(`${apiBase}/met/point-sky`,{signal:AbortSignal.timeout(10000)});
      if (!response.ok) return;
      pointForecast = await response.json();
      if (latestDetail) render(latestDetail);
    } catch (_) { /* The regional description remains the optional fallback. */ }
  }
  async function refreshOverride() {
    try {
      const response = await fetch(`${apiBase}/weather-window/sky?_=${Date.now()}`,{cache:"no-store",signal:AbortSignal.timeout(6000)});
      if (!response.ok) return;
      const data = await response.json(); skyOverride = data.override || null;
      if (adminSelect && document.activeElement !== adminSelect) adminSelect.value = skyOverride?.sky || "auto";
      if (adminRain && document.activeElement !== adminRain) adminRain.value = skyOverride?.rain || "auto";
      if (latestDetail) render(latestDetail);
    } catch (_) { /* Missing override service does not block the forecast scene. */ }
  }
  if (adminControls && new URLSearchParams(location.search).get("admin") === "1") {
    adminControls.hidden = false;
    document.getElementById("weatherWindowSkySave")?.addEventListener("click", async () => {
      const done=window.ParknacrossAction?.begin(document.getElementById("weatherWindowSkySave"),"Saving…");if(done===null)return;
      try {
        let key = sessionStorage.getItem("parknacrossAdminKey") || window.prompt("Enter the Parknacross admin key") || "";
        if (!key) return;
        adminStatus.textContent = "Checking illustration compatibility…";
        const compatible = await fetch(`${apiBase}/admin/capabilities`,{headers:{"X-Parknacross-Admin-Key":key},cache:"no-store",signal:AbortSignal.timeout(10000)});
        if (!compatible.ok || !(await compatible.json()).features?.rain_override) throw new Error("Deploy Worker v38.4.89 before saving illustration settings. Preview and compatibility details are on the administration page.");
        adminStatus.textContent = "Saving illustration settings…";
        const response = await fetch(`${apiBase}/weather-window/sky`, {method:"POST",headers:{"Content-Type":"application/json","X-Parknacross-Admin-Key":key},body:JSON.stringify({sky:adminSelect.value,rain:adminRain?.value || "auto",duration:document.getElementById("weatherWindowSkyDuration")?.value || "today"}),signal:AbortSignal.timeout(10000)});
        if (!response.ok) throw new Error(response.status === 401 ? "Admin key was not accepted." : "Could not save. Ensure the updated Worker has been deployed.");
        const data = await response.json();
        if (adminRain?.value && adminRain.value !== "auto" && data.override?.rain !== adminRain.value) throw new Error("Deploy Worker v38.4.88 to save rain and storm settings.");
        skyOverride = data.override || null;
        sessionStorage.setItem("parknacrossAdminKey",key);
        adminStatus.textContent = skyOverride ? `Saved for all visitors until ${(skyOverride.expires_at ? new Date(skyOverride.expires_at).toLocaleTimeString("en-IE",{timeZone:"Europe/Dublin",hour:"2-digit",minute:"2-digit"}) : "midnight")}.` : "Automatic forecast sky and station rain restored.";
        if (latestDetail) render(latestDetail);
      } catch (error) { adminStatus.textContent = error.message || "Could not save sky setting."; } finally { done?.(); }
    });
  }
  function render(detail) {
    if (!detail || !detail.current || typeof detail.current !== "object") return;
    latestDetail = detail;
    const current = detail.current;
    const sky = skyState(detail);
    const skyName = skyLabels[sky.sky] || skyLabels.unknown;
    scene.dataset.sky = sky.sky;
    const provenance = sky.source === "observer" ? "Sky set from a local visual observation" : sky.source === "point" ? `Met Éireann hourly forecast for Ardamine · ${sky.cloud_percent}% cloud cover` : sky.source === "forecast" ? "Sky guided by Met Éireann’s Leinster forecast" : "Forecast sky unavailable · local readings continue";
    if (sourceLabel) sourceLabel.textContent = `${skyName}. ${provenance}.`;
    const speed = numberOrNull(current.wind_speed_kmh);
    const gust = numberOrNull(current.wind_gust_kmh);
    const direction = compass(current.wind_direction_deg);
    const rate = numberOrNull(current.rain_rate_mm_h);
    const solar = numberOrNull(current.solar_w_m2);
    const windText = speed === null ? "Unavailable" : `${format(speed)} km/h${direction ? ` from ${direction}` : ""}${gust === null ? "" : ` · gust ${format(gust)} km/h`}`;
    const rainText = rate === null ? "Unavailable" : `${format(rate)} mm/h`;
    const solarText = solar === null ? "Unavailable" : `${format(solar, 0)} W/m²`;
    if (windValue) windValue.textContent = windText;
    if (rainValue) rainValue.textContent = rainText;
    if (solarValue) solarValue.textContent = solarText;

    let rainDescription = "Rain reading unavailable.";
    if (rate !== null && rate > 0) rainDescription = `Rain is being measured at ${format(rate)} mm/h.`;
    else if (rate !== null && detail.rainDetected) rainDescription = "Recent rain was detected; the latest measured rate is 0.0 mm/h.";
    else if (rate !== null) rainDescription = "No rain is reported in the latest local reading.";

    const parts = [];
    parts.push(speed === null ? "Wind reading unavailable." : `Wind ${windText}.`);
    parts.push(rainDescription);
    parts.push(solar === null ? "Sunlight reading unavailable." : `Solar radiation measured at ${format(solar, 0)} W/m².`);
    parts.push(`Updated ${stamp(current.epoch)} by the Parknacross station.`);
    observation.textContent = parts.join(" ");

    const light = detail.isNight === true ? "night" : detail.isDaylight === false ? "twilight" : "day";
    scene.style.setProperty("--ww-sun-opacity", solar === null ? ".65" : String(Math.max(.45, Math.min(1, solar / 450))));
    const windLevel = speed === null ? "unknown" : speed >= 30 || (gust !== null && gust >= 45) ? "strong" : speed >= 8 || (gust !== null && gust >= 15) ? "breezy" : "calm";
    const rainOverride = activeOverride()?.rain;
    const manualRain = Boolean(rainLabels[rainOverride]);
    const rainLevel = manualRain ? rainOverride : rate === null ? "unknown" : rate > 0 ? "measured" : "none";
    const rainNote = manualRain ? `${rainLabels[rainOverride]} · manual visual override${skyOverride.expires_at ? " until " + new Date(skyOverride.expires_at).toLocaleTimeString("en-IE",{timeZone:"Europe/Dublin",hour:"2-digit",minute:"2-digit"}) : " until midnight"}${rainOverride === "thunderstorm" ? " · storm symbol set manually; no lightning detection implied" : ""}` : "Rain is shown only when the station measures rainfall";
    if (sourceLabel) sourceLabel.textContent += ` ${rainNote}.`;
    scene.dataset.rainSource = manualRain ? "observer" : "station";
    scene.dataset.light = light;
    const progress = numberOrNull(detail.sunProgress);
    scene.dataset.edge = light === "day" && progress !== null ? progress < .08 ? "dawn" : progress > .92 ? "dusk" : "midday" : "none";
    if (progress !== null) {
      const p = Math.max(0,Math.min(1,progress));
      const x = 265 + 365*p, y = 170 - Math.sin(Math.PI*p)*135;
      const sunTrack = scene.querySelector(".ww-sun-track");
      if (sunTrack) sunTrack.style.transform = `translate(${(x-555).toFixed(1)}px, ${(y-82).toFixed(1)}px)`;
    }
    scene.dataset.wind = windLevel;
    scene.dataset.rain = rainLevel;
    const lean = speed !== null && direction && (speed >= 3 || (gust ?? 0) >= 15)
      ? -Math.sin(Number(current.wind_direction_deg) * Math.PI / 180) * Math.min(10, Math.max(speed, (gust ?? 0) * .65) * .3)
      : 0;
    scene.style.setProperty("--ww-tree-lean", `${lean.toFixed(1)}deg`);
    scene.style.setProperty("--ww-tree-sway", `${windLevel === "strong" ? 4 : windLevel === "breezy" ? 1.8 : 0}deg`);
    scene.style.setProperty("--ww-wind-travel", `${Number(current.wind_direction_deg) >= 180 ? 28 : -28}px`);
    const tree = scene.querySelector(".ww-tree-trunk");
    if (tree) tree.style.transform = `rotate(${lean.toFixed(1)}deg)`;
    scene.style.setProperty("--ww-wind-duration", `${Math.max(1.6, 5.5 - Math.min(45, gust ?? speed ?? 0) * 0.075).toFixed(2)}s`);
    scene.setAttribute("aria-label", `${skyName}. ${provenance}. ${rainNote}. Local readings: ${windText}. ${rainDescription} ${solarText}.`);
  }

  window.addEventListener("parknacross:weather-window-forecast", event => {
    forecast = event.detail;
    if (latestDetail) { try { render(latestDetail); } catch (_) {} }
  });
  refreshOverride();
  refreshPointSky();
  ((fn,ms)=>(window.ParknacrossRefresh?.every?window.ParknacrossRefresh.every(fn,ms,{resume:false}):setInterval(fn,ms)))(refreshOverride, 60000);
  ((fn,ms)=>(window.ParknacrossRefresh?.every?window.ParknacrossRefresh.every(fn,ms,{resume:false}):setInterval(fn,ms)))(refreshPointSky,20*60000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) { refreshOverride(); refreshPointSky(); } });
  window.addEventListener("parknacross:weather-window-observation", event => {
    try { render(event.detail); }
    catch (error) { console.info("Weather Window is unavailable; dashboard readings continue normally.", error); }
  });
})();
