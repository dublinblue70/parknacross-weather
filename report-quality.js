(() => {
  'use strict';
  const usable = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
  const shift = (day, amount) => {
    const [year, month, date] = day.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, date + amount, 12)).toISOString().slice(0, 10);
  };
  function describe(rows, period, coverage, now = new Date()) {
    const today = new Intl.DateTimeFormat('en-CA', {timeZone:'Europe/Dublin', year:'numeric', month:'2-digit', day:'2-digit'}).format(now);
    const start = period.length === 7 ? period + '-01' : period + '-01-01';
    const end = period.length === 7 ? shift(shift(start, 32).slice(0, 7) + '-01', -1) : period + '-12-31';
    const through = end < today ? end : today;
    if (start > through) return 'No observations are expected for this future period yet.';
    const first = coverage?.collection_start_day;
    const collectionStart = /^\d{4}-\d{2}-\d{2}$/.test(first || '') ? first : null;
    const effectiveStart = collectionStart && collectionStart > start ? collectionStart : start;
    const dayCount = (from, to) => Math.max(0, Math.round((Date.parse(to+'T12:00:00Z')-Date.parse(from+'T12:00:00Z'))/86400000)+1);
    const expectedDays = dayCount(effectiveStart, through);
    const beforeRecording = collectionStart ? dayCount(start, shift(effectiveStart < through ? effectiveStart : shift(through,1), -1)) : 0;
    const captured = new Set(rows.map(row => row.day).filter(day => day >= effectiveStart && day <= through));
    const byDay = new Map((coverage?.days || []).map(row => [row.day, row]));
    let actual = 0, expected = 0, incomplete = 0, unknown = 0;
    for (const day of captured) {
      const row = byDay.get(day);
      if (!row || !usable(row.actual_slots) || !usable(row.expected_slots) || !usable(row.coverage_percent)) { unknown++; continue; }
      actual += Number(row.actual_slots); expected += Number(row.expected_slots);
      if (Number(row.coverage_percent) < 98 || row.coverage_scope === 'since_first_observation') incomplete++;
    }
    const missing = Math.max(0, expectedDays - captured.size);
    const percentage = expected ? Math.min(100, actual / expected * 100).toFixed(1) : null;
    return `${captured.size}/${expectedDays} calendar days recorded through ${through}${collectionStart && collectionStart > start ? ` since station records began on ${collectionStart}` : ''}. ${beforeRecording ? `${beforeRecording} earlier day${beforeRecording===1?' was':'s were'} before station recording began, not archive gaps. ` : ''}${missing ? `${missing} day${missing===1?' has':'s have'} no archived observations. ` : ''}${percentage ? `${percentage}% of expected five-minute slots captured on days with checked coverage. ` : ''}${incomplete} recorded day${incomplete===1?' has':'s have'} incomplete coverage.${unknown ? ` Coverage could not be verified for ${unknown} recorded day${unknown===1?'':'s'}.` : ''} ${through===today ? 'Today is measured only up to the latest coverage check. ' : ''}Totals, averages and recorded extremes use available observations; missing readings may affect them.`;
  }
  let request;
  function load() {
    if (!request) {
      const base = window.PARKNACROSS_CONFIG?.apiBase || 'https://parknacross-weather.dave-s-carter.workers.dev';
      const get = async path => {const response = await fetch(base+path, {cache:'no-store', signal:AbortSignal.timeout(20000)}); if (!response.ok) throw Error('Coverage unavailable'); return response.json();};
      request = Promise.allSettled([get('/coverage?days=371'), get('/stats')]).then(([coverage, stats]) => {
        const data = coverage.status === 'fulfilled' ? coverage.value : {};
        const first = stats.status === 'fulfilled' ? stats.value.first_epoch : null;
        if (usable(first)) data.collection_start_day = new Intl.DateTimeFormat('en-CA', {timeZone:'Europe/Dublin',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(Number(first)*1000));
        return data;
      });
    }
    return request;
  }
  window.ParknacrossReportQuality = {describe, load};
})();
