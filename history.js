const API_BASE = "https://parknacross-weather.dave-s-carter.workers.dev";
const $ = id => document.getElementById(id);
const set = (id, value) => { const e = $(id); if (e) e.textContent = value; };
const usable = v => v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v));
const n = (v, d = 1) => usable(v) ? Number(v).toFixed(d) : "--";

let selectedDays = 30;
let dailyRows = [];
let charts = {};

function dateLabel(value) {
  if (!value) return "--";
  const date = typeof value === "number" ? new Date(value * 1000) : new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleDateString("en-IE", { day: "numeric", month: "short", year: "numeric" });
}

function shortDate(day) {
  const date = new Date(`${day}T12:00:00`);
  return date.toLocaleDateString("en-IE", { day: "numeric", month: "short" });
}

async function getJSON(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  if (data?.error) throw new Error(data.error);
  return data;
}

function createCharts() {
  Chart.defaults.color = "#bfd0e3";
  Chart.defaults.font.family = "Inter,system-ui,sans-serif";

  charts.temp = new Chart($("dailyTempChart"), {
    type: "line",
    data: {
      labels: [],
      datasets: [
        {
          label: "Daily high °C",
          data: [],
          borderColor: "#ff8d8d",
          backgroundColor: "#ff8d8d",
          borderWidth: 2.2,
          pointRadius: 1,
          tension: .25
        },
        {
          label: "Daily low °C",
          data: [],
          borderColor: "#74ddff",
          backgroundColor: "#74ddff",
          borderWidth: 2.2,
          pointRadius: 1,
          tension: .25
        }
      ]
    },
    options: {
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      scales: {
        x: { grid: { color: "transparent" }, ticks: { color: "#a8bfd4", maxTicksLimit: 10 } },
        y: { grid: { color: "rgba(163,209,255,.10)" }, ticks: { color: "#a8bfd4" }, title: { display: true, text: "°C", color: "#a8bfd4" } }
      },
      plugins: { legend: { position: "bottom" } }
    }
  });

  charts.rain = new Chart($("dailyRainChart"), {
    type: "bar",
    data: { labels: [], datasets: [{ label: "Rainfall mm", data: [], backgroundColor: "#7ca9ff", borderRadius: 6 }] },
    options: {
      maintainAspectRatio: false,
      scales: {
        x: { grid: { color: "transparent" }, ticks: { color: "#a8bfd4", maxTicksLimit: 10 } },
        y: { beginAtZero: true, grid: { color: "rgba(163,209,255,.10)" }, ticks: { color: "#a8bfd4" }, title: { display: true, text: "mm", color: "#a8bfd4" } }
      },
      plugins: { legend: { display: false } }
    }
  });
}

function renderCharts() {
  const rows = dailyRows.slice(-selectedDays);
  const labels = rows.map(row => shortDate(row.day));

  charts.temp.data.labels = labels;
  charts.temp.data.datasets[0].data = rows.map(row => row.high_c);
  charts.temp.data.datasets[1].data = rows.map(row => row.low_c);
  charts.temp.update();

  charts.rain.data.labels = labels;
  charts.rain.data.datasets[0].data = rows.map(row => row.rain_mm);
  charts.rain.update();
}

function renderStats(stats) {
  set("historyMonthRain", `${n(stats.month_rain_mm)} mm`);
  set("historyMonthRainDays", `${stats.month_rain_days ?? 0} rain day${stats.month_rain_days === 1 ? "" : "s"}`);
  set("historyYearRain", `${n(stats.year_rain_mm)} mm`);
  set("historySince", dateLabel(stats.first_epoch));
  set("histSamples", stats.total_samples ?? "--");

  if (stats.wettest_day) {
    set("historyWettest", `${n(stats.wettest_day.rain_mm)} mm`);
    set("historyWettestDate", dateLabel(`${stats.wettest_day.day}T12:00:00`));
  }

  const r = stats.records || {};
  if (r.high_temperature) {
    set("histAllHigh", `${n(r.high_temperature.value)} °C`);
    set("histAllHighDate", dateLabel(r.high_temperature.epoch));
  }
  if (r.low_temperature) {
    set("histAllLow", `${n(r.low_temperature.value)} °C`);
    set("histAllLowDate", dateLabel(r.low_temperature.epoch));
  }
  if (r.peak_gust) {
    set("histAllGust", `${n(r.peak_gust.value)} km/h`);
    set("histAllGustDate", dateLabel(r.peak_gust.epoch));
  }
  if (r.high_pressure) {
    set("histAllPressureHigh", `${n(r.high_pressure.value)} hPa`);
    set("histAllPressureHighDate", dateLabel(r.high_pressure.epoch));
  }
  if (r.low_pressure) {
    set("histAllPressureLow", `${n(r.low_pressure.value)} hPa`);
    set("histAllPressureLowDate", dateLabel(r.low_pressure.epoch));
  }
}

async function loadHistory() {
  try {
    const [daily, stats] = await Promise.all([
      getJSON(`${API_BASE}/daily?days=365`),
      getJSON(`${API_BASE}/stats`)
    ]);
    dailyRows = Array.isArray(daily.days) ? daily.days : [];
    renderCharts();
    renderStats(stats);
  } catch (error) {
    console.error("History:", error);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  createCharts();
  set("year", new Date().getFullYear());

  document.querySelectorAll("[data-days]").forEach(button => {
    button.addEventListener("click", () => {
      selectedDays = Number(button.dataset.days);
      document.querySelectorAll("[data-days]").forEach(b => b.classList.toggle("active", b === button));
      renderCharts();
    });
  });

  loadHistory();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  }
});
