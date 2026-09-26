/* Parknacross Weather · WH57 lightning charts · v38.4.97
 * Additive frontend script: uses the existing /history readings without changing
 * the Worker, D1 schema, existing charts or other site functions.
 */
(() => {
  'use strict';
  const cfg = window.PARKNACROSS_CONFIG || {};
  const API = String(cfg.apiBase || '').replace(/\/$/, '');
  const $ = id => document.getElementById(id);
  const localTime = epoch => new Date(epoch * 1000).toLocaleString('en-IE', {
    timeZone: 'Europe/Dublin', day: '2-digit', month: 'short',
    hour: '2-digit', minute: '2-digit'
  });
  const valid = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
  const counter = value => valid(value) && Number(value) >= 0 && Number.isInteger(Number(value)) ? Number(value) : null;
  const distance = value => valid(value) && Number(value) >= 0 && Number(value) <= 40 ? Number(value) : null;
  const epochOf = row => {
    if (valid(row?.epoch)) return Number(row.epoch);
    const n = Date.parse(row?.received_at || '');
    return Number.isFinite(n) ? n / 1000 : null;
  };
  const eventEpoch = value => {
    if (!valid(value)) return null;
    const n = Number(value);
    const seconds = n > 1e12 ? n / 1000 : n;
    return Number.isFinite(seconds) && seconds > 1500000000 ? seconds : null;
  };
  // Five-minute bins for the live day; wider bins keep longer histories legible.
  const intervalSeconds = hours => hours <= 24 ? 300 : hours <= 48 ? 900 : hours <= 168 ? 3600 : 21600;
  const intervalLabel = seconds => ({300:'5-minute',900:'15-minute',3600:'hourly',21600:'6-hour'})[seconds];
  function buildSeries(readings, hours, nowEpoch) {
    const interval = intervalSeconds(hours);
    const start = nowEpoch - hours * 3600;
    const first = Math.floor(start / interval) * interval;
    const last = Math.floor(nowEpoch / interval) * interval;
    const length = Math.floor((last - first) / interval) + 1;
    const count = Array(length).fill(null);
    const distances = Array(length).fill(null);
    const eventLabels = Array(length).fill(null);
    const labels = Array.from({length}, (_, index) => localTime(first + index * interval));
    const sorted = (Array.isArray(readings) ? readings : [])
      .filter(row => epochOf(row) !== null)
      .sort((a,b) => epochOf(a) - epochOf(b));
    let previous = null, observed = 0, counted = 0, eventCount = 0;
    let skippedIntervals = 0;
    const seenEvents = new Set();
    for (const row of sorted) {
      const at = epochOf(row);
      if (at < start || at > nowEpoch + 120) continue;
      const index = Math.floor((at - first) / interval);
      if (index < 0 || index >= length) continue;
      const c = counter(row.lightning_strikes);
      if (c !== null) {
        observed++;
        if (count[index] === null) count[index] = 0;
        if (previous !== null) {
          const elapsed = at - previous.at;
          if (elapsed > 0 && elapsed <= 20 * 60 && c >= previous.c) {
            const increase = c - previous.c;
            count[index] += increase;
            counted += increase;
          } else if (elapsed > 20 * 60) {
            // A gap makes the intervening timing unknown: never assign its
            // total counter increase to the final observed time bucket.
            skippedIntervals++;
          }
          // A falling counter is treated as a reset. Never plot a negative strike.
        }
        previous = {at, c};
      } else {
        previous = null;  // Missing counter breaks the continuous count series.
      }
      const event = eventEpoch(row.lightning_time_epoch);
      const km = distance(row.lightning_distance_km);
      // The station can repeat the same latest event in many archive samples.
      // Only show it once and only if timestamp matches the displayed period.
      if (event === null || km === null || seenEvents.has(event)) continue;
      if (event < start || event > nowEpoch + 120 || event > at + 120) continue;
      seenEvents.add(event);
      const eventIndex = Math.floor((event - first) / interval);
      if (eventIndex < 0 || eventIndex >= length) continue;
      if (distances[eventIndex] === null || km < distances[eventIndex]) {
        distances[eventIndex] = km;
        eventLabels[eventIndex] = localTime(event);
      }
      eventCount++;
    }
    return {labels, count, distances, eventLabels, observed, counted, eventCount,
      skippedIntervals, interval: intervalLabel(interval)};
  }
  // Expose a pure data transformation for non-network regression tests.
  window.ParknacrossLightningSeries = {buildSeries};
  let activityChart, distanceChart, hours = 24, requestId = 0, lastRefresh = 0;
  const plainAxis = unit => ({
    x: {grid:{color:'transparent'},ticks:{color:'#9fb3c1',maxTicksLimit:8}},
    y: {beginAtZero:true,...(unit === 'km' ? {min:0,max:40} : {}),grid:{color:'rgba(174,210,232,.09)'},
      ticks:{color:'#9fb3c1',precision:unit === 'Detected events' ? 0 : undefined,...(unit === 'km' ? {stepSize:5} : {})},
      title:{display:true,text:unit,color:'#9fb3c1'}}
  });
  function makeCharts() {
    if (!window.Chart || !$('gLightningCount') || !$('gLightningDistance')) return false;
    const common = {maintainAspectRatio:false,interaction:{mode:'index',intersect:false},
      plugins:{legend:{display:false}}};
    activityChart = new Chart($('gLightningCount'), {type:'bar',data:{labels:[],datasets:[{
      label:'New detections',data:[],backgroundColor:'#f2bb68',borderRadius:2,barPercentage:1,
      categoryPercentage:1
    }]},options:{...common,scales:plainAxis('Detected events')}});
    distanceChart = new Chart($('gLightningDistance'), {type:'line',data:{labels:[],datasets:[{
      label:'Lightning distance',data:[],borderColor:'#74ddff',backgroundColor:'#74ddff',
      showLine:false,pointRadius:4,pointHoverRadius:7,spanGaps:false
    }]},options:{...common,scales:plainAxis('km'),plugins:{legend:{display:false},tooltip:{
      callbacks:{afterLabel:context => distanceChart._eventLabels?.[context.dataIndex]
        ? `Detected: ${distanceChart._eventLabels[context.dataIndex]} (Irish time)` : ''}
    }}}});
    return true;
  }
  async function refresh(requestedHours) {
    hours = requestedHours;
    const id = ++requestId;
    const countStatus = $('lightningCountStatus'),distanceStatus = $('lightningDistanceStatus');
    if (!activityChart || !distanceChart) return;
    if (!API) {
      countStatus.textContent = 'Weather-data connection is not configured.';
      distanceStatus.textContent = 'Waiting for the weather-data connection.';
      return;
    }
    countStatus.textContent = 'Checking WH57 archive…';
    distanceStatus.textContent = 'Checking WH57 archive…';
    try {
      const response = await fetch(`${API}/history?hours=${hours}`, {cache:'default'});
      if (!response.ok) throw new Error(`History HTTP ${response.status}`);
      const data = await response.json();
      if (id !== requestId) return; // An earlier range response must not overwrite a later selection.
      const now = Date.now() / 1000;
      const series = buildSeries(data.readings, hours, now);
      activityChart.data.labels = series.labels;
      activityChart.data.datasets[0].data = series.count;
      distanceChart.data.labels = series.labels;
      distanceChart.data.datasets[0].data = series.distances;
      distanceChart._eventLabels = series.eventLabels;
      activityChart.update(); distanceChart.update();
      const periodLabel=({6:'6-hour',24:'24-hour',48:'48-hour',168:'7-day',720:'30-day'})[hours]||`${hours}-hour`;
      if (!series.observed) {
        countStatus.textContent = 'No WH57 strike-counter readings in this period yet. Missing data is not zero lightning.';
      } else if (series.counted) {
        countStatus.textContent = `${series.counted.toLocaleString('en-IE')} counter increase${series.counted===1?'':'s'} observed · ${series.interval} intervals${series.skippedIntervals?' · archive gaps excluded':''}. First reading sets the baseline.`;
      } else {
        countStatus.textContent = `No strike-counter increases recorded between saved readings · ${series.interval} intervals. An initial count is treated as a baseline, not a new detection.`;
      }
      distanceStatus.textContent = series.eventCount
        ? `${series.eventCount} distinct timed detection${series.eventCount===1?'':'s'} · distance in km · times shown in Irish local time. A smaller distance indicates a closer detection, not a storm forecast.`
        : 'No distinct, timed lightning-distance readings in this period. A missing reading is not evidence of no lightning.';
      $('gLightningCount')?.setAttribute('aria-label',`Lightning detections during the selected ${periodLabel} period. ${countStatus.textContent}`);
      $('gLightningDistance')?.setAttribute('aria-label',`Lightning-distance readings during the selected ${periodLabel} period. ${distanceStatus.textContent}`);
      lastRefresh = Date.now();
    } catch (error) {
      if (id !== requestId) return;
      countStatus.textContent = 'Lightning history could not be loaded. Existing weather charts are unaffected.';
      distanceStatus.textContent = 'Lightning-distance history is temporarily unavailable.';
      console.warn('Parknacross lightning charts:',error);
    }
  }
  document.addEventListener('DOMContentLoaded', () => {
    if (!makeCharts()) return;
    document.querySelectorAll('[data-hours]').forEach(button => {
      button.addEventListener('click', () => refresh(Number(button.dataset.hours) || 24));
    });
    refresh(24);
    setInterval(() => {if(Date.now()-lastRefresh>=4*60*1000)refresh(hours);},5*60*1000);
  });
})();
