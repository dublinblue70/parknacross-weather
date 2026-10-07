/* Forecast text is a regional guide; cloud cover is not a station measurement. */
(() => {
  'use strict';
  function period(hour) { return hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'; }
  function classify(text) {
    const t = String(text || '').toLowerCase();
    if (/overcast|persistent rain|continuous rain|heavy rain|thick cloud/.test(t)) return 'overcast';
    if (/fog|mist|haze/.test(t)) return 'cloudy';
    if (/mostly clear|mainly clear|few clouds|largely clear/.test(t)) return 'mostly-clear';
    if (/sunny spells|sunny intervals|bright spells|bright intervals|scattered cloud|partly cloudy|broken cloud|cloud.*(?:break|clear)|(?:clear|sunny).*spells/.test(t)) return 'partly-cloudy';
    if (/cloudy|cloudier|cloud cover|clouding|dull|rain|showers/.test(t)) return 'cloudy';
    if (/clear|sunny|sunshine/.test(t)) return 'clear';
    return 'unknown';
  }
  function selectText(text, currentPeriod) {
    const clauses = String(text || '').replace(/\s+/g, ' ').split(/[.!?;,]+|\bbut\b|\bthen\b|\bbecoming\b|\bturning\b/i).map(s => s.trim()).filter(Boolean);
    const matched = [], general = [];
    for (const clause of clauses) {
      const marks = [];
      if (/morning|at first|initially|early on/i.test(clause)) marks.push('morning');
      if (/afternoon/i.test(clause)) marks.push('afternoon');
      if (/evening|tonight|overnight|night/i.test(clause)) marks.push('evening');
      if (/later|as the day goes on/i.test(clause) && !marks.length) marks.push('afternoon', 'evening');
      if (marks.includes(currentPeriod)) matched.push(clause);
      else if (!marks.length) general.push(clause);
    }
    const useful = list => list.filter(s => classify(s) !== 'unknown').join('. ');
    return useful(matched) || useful(general);
  }
  function resolve(forecast, {hour, isNight, day, now = Date.now()}) {
    if (!forecast || !forecast.fetchedAt || now - forecast.fetchedAt > 2 * 3600000 || now < forecast.fetchedAt - 60000) return {sky:'unknown', text:'', source:'unavailable'};
    const p = period(hour);
    let text = '';
    if (forecast.day === day) text = isNight && hour >= 17 ? forecast.tonight : forecast.today;
    else {
      const next = new Date(`${forecast.day}T12:00:00Z`); next.setUTCDate(next.getUTCDate() + 1);
      if (next.toISOString().slice(0,10) === day && !isNight) text = forecast.tomorrow;
    }
    const selected = selectText(text, isNight && hour >= 17 ? 'evening' : p);
    return {sky:classify(selected), text:selected, source:selected ? 'forecast' : 'unavailable'};
  }
  function fromCloudPercent(value) {
    if (value === null || value === undefined || value === "" || !Number.isFinite(Number(value)) || Number(value) < 0 || Number(value) > 100) return "unknown";
    const n = Number(value);
    return n <= 15 ? "clear" : n <= 35 ? "mostly-clear" : n <= 65 ? "partly-cloudy" : n <= 85 ? "cloudy" : "overcast";
  }
  function resolvePoint(data, now = Date.now()) {
    const fetched = Date.parse(data?.fetched_at || "");
    if (!Number.isFinite(fetched) || now - fetched > 2 * 3600000 || fetched > now + 60000) return null;
    const rows = (Array.isArray(data?.points) ? data.points : []).filter(p => Number.isFinite(Number(p.epoch)) && fromCloudPercent(p.cloud_percent) !== "unknown").sort((a,b)=>a.epoch-b.epoch);
    const t = now / 1000;
    const before = [...rows].reverse().find(p=>Number(p.epoch)<=t), after = rows.find(p=>Number(p.epoch)>=t);
    let percent;
    if (before && after && after.epoch !== before.epoch && after.epoch-before.epoch <= 7200) {
      const f = (t-before.epoch)/(after.epoch-before.epoch);
      percent = Number(before.cloud_percent)+(Number(after.cloud_percent)-Number(before.cloud_percent))*f;
    } else {
      const closest = rows.reduce((best,p)=>!best || Math.abs(p.epoch-t)<Math.abs(best.epoch-t) ? p : best,null);
      if (!closest || Math.abs(closest.epoch-t)>90*60) return null;
      percent = Number(closest.cloud_percent);
    }
    return {sky:fromCloudPercent(percent),source:"point",cloud_percent:Math.round(percent)};
  }
  window.ParknacrossWeatherSky = Object.freeze({period, classify, selectText, resolve, fromCloudPercent, resolvePoint});
})();
