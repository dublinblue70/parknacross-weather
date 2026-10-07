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
  window.ParknacrossWeatherSky = Object.freeze({period, classify, selectText, resolve});
})();
