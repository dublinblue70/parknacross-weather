(() => {
  "use strict";

  const scene = document.getElementById("weatherWindowScene");
  const observation = document.getElementById("weatherWindowObservation");
  const windValue = document.getElementById("weatherWindowWind");
  const rainValue = document.getElementById("weatherWindowRain");
  const solarValue = document.getElementById("weatherWindowSolar");
  const soundButton = document.getElementById("weatherSoundToggle");
  const soundVolume = document.getElementById("weatherSoundVolume");
  const soundStatus = document.getElementById("weatherSoundStatus");
  if (!scene || !observation || !soundButton || !soundVolume || !soundStatus) return;

  const directions = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  const numberOrNull = value => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value)) ? Number(value) : null;
  const format = (value, digits = 1) => numberOrNull(value) === null ? "Unavailable" : Number(value).toFixed(digits);
  let latest = null;
  let audio = null;
  let audioPlaying = false;

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

  function updateAudioLevels() {
    if (!audio || !latest) return;
    const speed = numberOrNull(latest.current.wind_speed_kmh);
    const rate = numberOrNull(latest.current.rain_rate_mm_h);
    const wind = speed === null ? 0 : 0.018 + Math.min(80, Math.max(0, speed)) * 0.00045;
    const rain = rate === null ? 0 : Math.min(0.045, Math.max(0, rate) * 0.009);
    const at = audio.context.currentTime;
    audio.wind.gain.setTargetAtTime(wind, at, 0.45);
    audio.rain.gain.setTargetAtTime(rain, at, 0.45);
    audio.windFilter.frequency.setTargetAtTime(220 + Math.min(80, Math.max(0, speed || 0)) * 19, at, 0.55);
  }

  function render(detail) {
    if (!detail || !detail.current || typeof detail.current !== "object") return;
    latest = detail;
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
    if (speed !== null) parts.push(`Wind ${windText}.`);
    else parts.push("Wind reading unavailable.");
    parts.push(rainDescription);
    parts.push(solar === null ? "Sunlight reading unavailable." : `Solar radiation measured at ${format(solar, 0)} W/m².`);
    parts.push(`Updated ${stamp(current.epoch)} by the Parknacross station.`);
    observation.textContent = parts.join(" ");

    const light = detail.isNight === true ? "night" : solar === null ? "unknown" : solar >= 100 ? "day" : "soft";
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

    soundButton.disabled = speed === null && rate === null;
    updateAudioLevels();
    if (!audioPlaying && !soundButton.disabled) soundStatus.textContent = "Sound is created in your browser and starts only when you press Play.";
  }

  function makeAudio() {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) throw new Error("Audio is not supported by this browser.");
    const context = new AudioContext();
    const buffer = context.createBuffer(1, Math.max(1, context.sampleRate * 2), context.sampleRate);
    const samples = buffer.getChannelData(0);
    let previous = 0;
    for (let index = 0; index < samples.length; index++) {
      const white = Math.random() * 2 - 1;
      previous = previous * 0.18 + white * 0.82;
      samples[index] = previous;
    }

    const master = context.createGain();
    master.gain.value = Number(soundVolume.value) / 100;
    master.connect(context.destination);

    const windSource = context.createBufferSource();
    const windFilter = context.createBiquadFilter();
    const windGain = context.createGain();
    windSource.buffer = buffer;
    windSource.loop = true;
    windFilter.type = "lowpass";
    windFilter.frequency.value = 320;
    windGain.gain.value = 0;
    windSource.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(master);
    windSource.start();

    const rainSource = context.createBufferSource();
    const rainFilter = context.createBiquadFilter();
    const rainGain = context.createGain();
    rainSource.buffer = buffer;
    rainSource.loop = true;
    rainFilter.type = "highpass";
    rainFilter.frequency.value = 1450;
    rainGain.gain.value = 0;
    rainSource.connect(rainFilter);
    rainFilter.connect(rainGain);
    rainGain.connect(master);
    rainSource.start();

    audio = { context, master, wind: windGain, rain: rainGain, windFilter };
    updateAudioLevels();
  }

  function setPlaying(playing, status) {
    audioPlaying = playing;
    soundButton.setAttribute("aria-pressed", String(playing));
    soundButton.textContent = playing ? "Ⅱ Stop the Parknacross soundscape" : "▶ Play the Parknacross soundscape";
    if (status) soundStatus.textContent = status;
  }

  soundButton.addEventListener("click", async () => {
    if (audioPlaying && audio) {
      try { await audio.context.suspend(); } catch (_) {}
      setPlaying(false, "Soundscape stopped.");
      return;
    }
    try {
      if (!audio) makeAudio();
      await audio.context.resume();
      updateAudioLevels();
      setPlaying(true, "Playing a locally generated sound from the latest measured wind and rain. It stops when you press Stop or hide this page.");
    } catch (error) {
      setPlaying(false, "Soundscape unavailable in this browser. Your weather readings are unaffected.");
      console.info("Parknacross soundscape unavailable:", error);
    }
  });

  soundVolume.addEventListener("input", () => {
    if (audio) audio.master.gain.setTargetAtTime(Number(soundVolume.value) / 100, audio.context.currentTime, 0.08);
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden && audioPlaying && audio) {
      audio.context.suspend().catch(() => {});
      setPlaying(false, "Soundscape paused because this page is hidden.");
    }
  });

  window.addEventListener("parknacross:weather-window-observation", event => {
    try { render(event.detail); }
    catch (error) { console.info("Weather Window is unavailable; dashboard readings continue normally.", error); }
  });
})();
