const fields = {
  temperature: document.getElementById("temperature"),
  feelsLike: document.getElementById("feelsLike"),
  humidity: document.getElementById("humidity"),
  pressure: document.getElementById("pressure"),
  windSpeed: document.getElementById("windSpeed"),
  windDirection: document.getElementById("windDirection"),
  windGust: document.getElementById("windGust"),
  rainfall: document.getElementById("rainfall"),
  uv: document.getElementById("uv"),
  solar: document.getElementById("solar"),
};

function setValue(key, value) {
  if (fields[key]) {
    fields[key].textContent = value ?? "--";
  }
}

async function loadWeather() {
  const updated = document.getElementById("updated");

  if (!window.WEATHER_API_URL) {
    updated.textContent = "Add your Cloudflare Worker URL in config.js to show live data.";
    return;
  }

  try {
    const response = await fetch(window.WEATHER_API_URL, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();

    setValue("temperature", data.temperature);
    setValue("feelsLike", data.feelsLike);
    setValue("humidity", data.humidity);
    setValue("pressure", data.pressure);
    setValue("windSpeed", data.windSpeed);
    setValue("windDirection", data.windDirection);
    setValue("windGust", data.windGust);
    setValue("rainfall", data.rainfall);
    setValue("uv", data.uv);
    setValue("solar", data.solar);

    updated.textContent = data.updated
      ? `Updated ${new Date(data.updated).toLocaleString()}`
      : `Updated ${new Date().toLocaleString()}`;
  } catch (error) {
    console.error(error);
    updated.textContent = "Unable to retrieve live weather data.";
  }
}

loadWeather();
setInterval(loadWeather, 60000);
