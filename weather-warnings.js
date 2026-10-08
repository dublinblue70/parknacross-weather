(() => {
  'use strict';
  const severity = {red:3,orange:2,yellow:1};
  function select(items, now = Date.now()) {
    return (Array.isArray(items) ? items : []).filter(w => {
      const text = [w.type,w.event,w.status,w.headline,w.description].filter(Boolean).join(' ').toLowerCase();
      const expiry = Date.parse(w.expires || w.expiry || '');
      return !/potato|blight|farming|agricultur|environmental advisory/.test(text) && (!Number.isFinite(expiry) || expiry > now);
    }).map(w => {
      const value = String(w.level || w.severity || w.status || '').toLowerCase();
      const level = Object.keys(severity).find(x => value.includes(x)) || 'unknown';
      const onset = Date.parse(w.onset || '');
      return {...w,level,expires:w.expires || w.expiry || null,upcoming:Number.isFinite(onset) && onset > now};
    }).sort((a,b) => (severity[b.level] || 0) - (severity[a.level] || 0) || Number(a.upcoming)-Number(b.upcoming) || (Date.parse(a.onset)||0)-(Date.parse(b.onset)||0));
  }
  window.ParknacrossWarnings = {select};
})();
