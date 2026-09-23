(() => {
  const LABELS = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
  const CALM_THRESHOLD_KMH = 1;

  const usable = value =>
    value !== null &&
    value !== undefined &&
    value !== "" &&
    Number.isFinite(Number(value));

  const BUCKET_SECONDS = 300;
  // One representative reading per UTC five-minute slot. The most recent
  // valid reading wins, regardless of archive insertion order.
  function distribution(rows, options = {}) {
    const bins = new Array(LABELS.length).fill(0);
    const endEpoch = Number.isFinite(Number(options.endEpoch)) && options.endEpoch != null
      ? Math.floor(Number(options.endEpoch) / BUCKET_SECONDS) * BUCKET_SECONDS
      : Math.floor(Date.now() / 1000 / BUCKET_SECONDS) * BUCKET_SECONDS;
    const hours = Number(options.hours);
    const startEpoch = Number.isFinite(hours) && hours > 0 ? endEpoch - hours * 3600 : -Infinity;
    const slots = new Map();
    for (const row of rows || []) {
      const epoch = Number(row?.epoch ?? (row?.received_at ? Date.parse(row.received_at) / 1000 : NaN));
      if (!Number.isFinite(epoch) || epoch < startEpoch || epoch >= endEpoch) continue;
      if (!usable(row?.wind_direction_deg) || !usable(row?.wind_speed_kmh)) continue;
      const speed = Number(row.wind_speed_kmh);
      const degrees = Number(row.wind_direction_deg);
      if (speed < 0 || !Number.isFinite(degrees) || degrees < 0 || degrees > 360) continue;
      const bucket = Math.floor(epoch / BUCKET_SECONDS);
      const previous = slots.get(bucket);
      if (!previous || epoch >= previous.epoch) slots.set(bucket, {epoch, speed, degrees});
    }
    let directional = 0, calm = 0;
    for (const {speed, degrees} of slots.values()) {
      if (speed < CALM_THRESHOLD_KMH) { calm++; continue; }
      bins[Math.round((degrees % 360) / 22.5) % LABELS.length]++;
      directional++;
    }
    return {bins, calm, directional, intervalCount: slots.size,
      percentages: bins.map(count => directional ? count / directional * 100 : 0)};
  }

  function create(canvas) {
    if (!canvas || typeof Chart === "undefined") return null;

    return new Chart(canvas, {
      type: "bar",
      data: {
        labels: [...LABELS],
        datasets: [{
          label: "Direction frequency %",
          data: new Array(LABELS.length).fill(0),
          backgroundColor: LABELS.map((_, index) => `hsla(${185 + index * 3},78%,68%,.58)`),
          borderColor: "rgba(174,225,244,.32)",
          borderWidth: 1
        }]
      },
      options: {
        maintainAspectRatio: false,
        scales: {x:{grid:{display:false},ticks:{color:"#bfd0e3",font:{size:10}}},y:{beginAtZero:true,grid:{color:"rgba(174,210,232,.11)"},ticks:{color:"#bfd0e3",callback:value=>`${value}%`},title:{display:true,text:"Share of non-calm intervals (%)",color:"#bfd0e3"}}},
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: context => `${context.label}: ${Number(context.raw || 0).toFixed(1)}%`
            }
          }
        }
      }
    });
  }

  function update(chart, rows, metaElement, options = {}) {
    if (!chart) return distribution(rows, options);

    const result = distribution(rows, options);
    chart.data.datasets[0].data = result.percentages;
    chart.update();

    if (metaElement) {
      metaElement.textContent = result.directional
        ? `${result.directional.toLocaleString("en-IE")} five-minute directional intervals · percentages are of non-calm intervals · calm intervals omitted${result.calm ? ` (${result.calm.toLocaleString("en-IE")})` : ""}`
        : "No usable wind-direction observations in this period.";
    }

    return result;
  }

  window.ParknacrossWindRose = Object.freeze({
    labels: [...LABELS],
    calmThresholdKmh: CALM_THRESHOLD_KMH,
    bucketSeconds: BUCKET_SECONDS,
    distribution,
    create,
    update
  });
})();
