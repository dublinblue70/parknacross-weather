(() => {
  const LABELS = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
  const CALM_THRESHOLD_KMH = 1;

  const usable = value =>
    value !== null &&
    value !== undefined &&
    value !== "" &&
    Number.isFinite(Number(value));

  function distribution(rows) {
    const bins = new Array(LABELS.length).fill(0);
    let directional = 0;
    let calm = 0;

    for (const row of rows || []) {
      if (!usable(row?.wind_direction_deg) || !usable(row?.wind_speed_kmh)) continue;

      const speed = Number(row.wind_speed_kmh);
      if (speed < CALM_THRESHOLD_KMH) {
        calm += 1;
        continue;
      }

      const degrees = ((Number(row.wind_direction_deg) % 360) + 360) % 360;
      const index = Math.round(degrees / 22.5) % LABELS.length;
      bins[index] += 1;
      directional += 1;
    }

    return {
      bins,
      calm,
      directional,
      percentages: bins.map(count => directional ? count / directional * 100 : 0)
    };
  }

  function create(canvas) {
    if (!canvas || typeof Chart === "undefined") return null;

    return new Chart(canvas, {
      type: "polarArea",
      data: {
        labels: [...LABELS],
        datasets: [{
          label: "Direction frequency %",
          data: new Array(LABELS.length).fill(0),
          backgroundColor: LABELS.map((_, index) =>
            `hsla(${185 + index * 3},78%,68%,${0.30 + (index % 4) * 0.08})`
          ),
          borderColor: "rgba(174,225,244,.32)",
          borderWidth: 1
        }]
      },
      options: {
        maintainAspectRatio: false,
        scales: {
          r: {
            beginAtZero: true,
            startAngle: 0,
            grid: { color: "rgba(174,210,232,.11)" },
            angleLines: { color: "rgba(174,210,232,.11)" },
            ticks: { display: false },
            pointLabels: {
              display: true,
              color: "#bfd0e3",
              font: { size: 11 }
            }
          }
        },
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

  function update(chart, rows, metaElement) {
    if (!chart) return distribution(rows);

    const result = distribution(rows);
    chart.data.datasets[0].data = result.percentages;
    chart.update();

    if (metaElement) {
      metaElement.textContent = result.directional
        ? `${result.directional.toLocaleString("en-IE")} wind-direction readings · calm periods omitted${result.calm ? ` (${result.calm.toLocaleString("en-IE")})` : ""}`
        : "No usable wind-direction observations in this period.";
    }

    return result;
  }

  window.ParknacrossWindRose = Object.freeze({
    labels: [...LABELS],
    calmThresholdKmh: CALM_THRESHOLD_KMH,
    distribution,
    create,
    update
  });
})();
