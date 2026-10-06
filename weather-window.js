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

  function render(detail) {
    if (!detail || !detail.current || typeof detail.current !== "object") return;
    const current = detail.current;
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

    const light = detail.isNight === true ? "night" : solar === null ? "unknown" : solar >= 300 ? "day" : "soft";
    const windLevel = speed === null ? "unknown" : speed >= 30 || (gust !== null && gust >= 45) ? "strong" : speed >= 8 ? "breezy" : "calm";
    const rainLevel = rate === null ? "unknown" : rate > 0 ? "measured" : "none";
    scene.dataset.light = light;
    scene.dataset.wind = windLevel;
    scene.dataset.rain = rainLevel;
    const lean = speed !== null && direction && speed >= 3
      ? -Math.sin(Number(current.wind_direction_deg) * Math.PI / 180) * Math.min(8, speed * 0.12)
      : 0;
    const tree = scene.querySelector(".ww-tree-trunk");
    if (tree) tree.style.transform = `rotate(${lean.toFixed(1)}deg)`;
    scene.style.setProperty("--ww-wind-duration", `${Math.max(1.6, 5.5 - Math.min(45, gust ?? speed ?? 0) * 0.075).toFixed(2)}s`);
    scene.setAttribute("aria-label", `Illustrated local conditions: ${windText}. ${rainDescription} ${solarText}.`);
  }

  window.addEventListener("parknacross:weather-window-observation", event => {
    try { render(event.detail); }
    catch (error) { console.info("Weather Window is unavailable; dashboard readings continue normally.", error); }
  });
})();
