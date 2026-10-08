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
    const expectedDays = Math.round((Date.parse(through+'T12:00:00Z')-Date.parse(start+'T12:00:00Z'))/86400000)+1;
    const captured = new Set(rows.map(row => row.day));
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
    return `${captured.size}/${expectedDays} calendar days recorded through ${through}. ${missing ? `${missing} day${missing===1?' has':'s have'} no archived observations. ` : ''}${percentage ? `${percentage}% of expected five-minute slots captured on days with checked coverage. ` : ''}${incomplete} recorded day${incomplete===1?' has':'s have'} incomplete coverage.${unknown ? ` Coverage could not be verified for ${unknown} recorded day${unknown===1?'':'s'}.` : ''} ${through===today ? 'Today is measured only up to the latest coverage check. ' : ''}Totals, averages and recorded extremes use available observations; missing readings may affect them.`;
  }
  let request;
  function load() {
    if (!request) {
      const base = window.PARKNACROSS_CONFIG?.apiBase || 'https://parknacross-weather.dave-s-carter.workers.dev';
      request = fetch(base+'/coverage?days=371', {cache:'no-store', signal:AbortSignal.timeout(20000)}).then(response => {
        if (!response.ok) throw Error('Coverage unavailable');
        return response.json();
      }).catch(() => null);
    }
    return request;
  }
  window.ParknacrossReportQuality = {describe, load};
})();
