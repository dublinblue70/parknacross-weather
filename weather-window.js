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
    /* Filtered noise loses energy on phone speakers. A compressor on the
       output catches peaks while these source gains keep the ambience audible. */
    const wind = speed === null ? 0 : Math.min(3.2, 1.6 + Math.min(64, Math.max(0, speed)) * 0.025);
    const rain = rate === null || rate <= 0 ? 0 : Math.min(1.35, 0.42 + Math.sqrt(Math.max(0, rate)) * 0.42);
    const hour = stationHour(latest.current.epoch);
    const birds = hour !== null && hour >= 5 && hour < 12 ? 0.46 : 0;
    const at = audio.context.currentTime;
    audio.wind.gain.setTargetAtTime(wind, at, 0.45);
    audio.rain.gain.setTargetAtTime(rain, at, 0.45);
    audio.birds.gain.setTargetAtTime(birds, at, 0.7);
    audio.windFilter.frequency.setTargetAtTime(600 + Math.min(80, Math.max(0, speed || 0)) * 45, at, 0.55);
  }

  function stationHour(epoch) {
    const value = numberOrNull(epoch);
    if (value === null) return null;
    const date = new Date(value * 1000);
    if (!Number.isFinite(date.getTime())) return null;
    const hour = Number(new Intl.DateTimeFormat("en-IE", {
      timeZone: "Europe/Dublin", hour: "2-digit", hourCycle: "h23"
    }).format(date));
    return Number.isFinite(hour) ? hour : null;
  }

  function makeBirdsongBuffer(context) {
    const seconds = 4;
    const buffer = context.createBuffer(1, Math.max(1, context.sampleRate * seconds), context.sampleRate);
    const samples = buffer.getChannelData(0);
    const chirps = [
      [0.22, 0.13, 2450, 3550], [0.43, 0.12, 2850, 3900],
      [1.08, 0.14, 2600, 3700], [1.31, 0.13, 3050, 4100],
      [2.24, 0.15, 2500, 3600], [2.50, 0.13, 2900, 4000],
      [3.26, 0.12, 2700, 3850], [3.48, 0.12, 3150, 4250]
    ];
    for (const [start, duration, low, high] of chirps) {
      const first = Math.floor(start * context.sampleRate);
      const count = Math.floor(duration * context.sampleRate);
      const sweep = high - low;
      for (let index = 0; index < count && first + index < samples.length; index++) {
        const time = index / context.sampleRate;
        const envelope = Math.sin(Math.PI * index / count) ** 2;
        const phase = 2 * Math.PI * (low * time + (sweep * time * time) / (2 * duration));
        samples[first + index] += Math.sin(phase) * envelope * 0.28;
      }
    }
    return buffer;
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
    if (!audioPlaying && !soundButton.disabled) soundStatus.textContent = "Synthetic sound is created in your browser from local readings. Press Play; check your phone’s media volume if it is quiet.";
  }

  function makeAudio() {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) throw new Error("Audio is not supported by this browser.");
    const context = new AudioContext();
    /* Resume inside the tap before buffer generation, for mobile browser policies. */
    const resumePromise = context.resume();
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
    const compressor = typeof context.createDynamicsCompressor === "function"
      ? context.createDynamicsCompressor()
      : null;
    if (compressor) {
      compressor.threshold.value = -8;
      compressor.knee.value = 6;
      compressor.ratio.value = 8;
      compressor.attack.value = 0.004;
      compressor.release.value = 0.16;
      compressor.connect(master);
    }
    const output = compressor || master;

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
    windGain.connect(output);
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
    rainGain.connect(output);
    rainSource.start();

    const birdSource = context.createBufferSource();
    const birdGain = context.createGain();
    birdSource.buffer = makeBirdsongBuffer(context);
    birdSource.loop = true;
    birdGain.gain.value = 0;
    birdSource.connect(birdGain);
    birdGain.connect(output);
    birdSource.start();

    audio = { context, resumePromise, master, wind: windGain, rain: rainGain, birds: birdGain, windFilter };
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
      await audio.resumePromise;
      if (audio.context.state !== "running") await audio.context.resume();
      updateAudioLevels();
      const hour = stationHour(latest?.current?.epoch);
      const birdNote = hour !== null && hour >= 5 && hour < 12
        ? " Soft synthetic birdlike chirps play during the Irish morning (05:00–12:00)."
        : " Synthetic birdlike chirps are limited to the Irish morning (05:00–12:00).";
      setPlaying(true, `Playing locally generated wind and rain ambience.${birdNote} It stops when you press Stop or hide this page.`);
    } catch (error) {
      setPlaying(false, "Your browser blocked the sound. Tap Play again or check your phone’s media volume. Weather readings are unaffected.");
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
