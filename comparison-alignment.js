(() => {
  'use strict';
  const usable = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
  const epoch = value => {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'number') return Number.isFinite(value) ? (value < 1e12 ? value : value / 1000) : null;
    const text = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(value) ? value + 'Z' : value;
    const time = Date.parse(text); return Number.isFinite(time) ? time / 1000 : null;
  };
  function match(official, rows, now = Date.now() / 1000) {
    const target = epoch(official?.report_time);
    if (!usable(official?.temperature_c) || target === null || now - target > 7200 || target - now > 300) return null;
    const candidates = (rows || []).filter(row => usable(row?.temperature_c) && Number(row.temperature_c) >= -50 && Number(row.temperature_c) <= 60 && epoch(row.epoch ?? row.received_at) !== null);
    candidates.sort((a, b) => Math.abs(epoch(a.epoch ?? a.received_at) - target) - Math.abs(epoch(b.epoch ?? b.received_at) - target));
    const row = candidates[0], observed = row ? epoch(row.epoch ?? row.received_at) : null;
    if (!row || Math.abs(observed - target) > 300) return null;
    return {local: Number(row.temperature_c), official: Number(official.temperature_c), delta: Number(row.temperature_c) - Number(official.temperature_c), localEpoch: observed, officialEpoch: target};
  }
  const clock = seconds => new Date(seconds * 1000).toLocaleString('en-IE', {timeZone: 'Europe/Dublin', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'});
  let cached = null, pending = null, bucket = null;
  async function load(official, current, get) {
    const direct = match(official, [current]); if (direct) return direct;
    if (epoch(official?.report_time) === null || Date.now() / 1000 - epoch(official.report_time) > 7200) return null;
    const next = Math.floor(Date.now() / 300000);
    if (bucket !== next) {bucket = next; cached = null; pending = null;}
    if (!pending) pending = get('/history?hours=4').then(data => {cached = data.readings || []; return cached;}).catch(() => {pending = null; return [];});
    return match(official, cached || await pending);
  }
  window.ParknacrossComparison = {epoch, match, load, clock};
})();
