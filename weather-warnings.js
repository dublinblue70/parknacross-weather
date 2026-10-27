(() => {
  'use strict';
  const severity = {red:3,orange:2,yellow:1};
  function plainText(value) {
    let text=String(value || "");
    // Parse only in a detached template; warning markup never enters the page.
    for(let pass=0;pass<2;pass++){
      const template=document.createElement('template');
      template.innerHTML=text.replace(/<br\s*\/?>|<\/(?:p|li|div|h[1-6])>/gi,'\n');
      template.content.querySelectorAll('script,style,iframe,object').forEach(node=>node.remove());
      text=template.content.textContent || '';
    }
    return text.replace(/[ \t]+/g,' ').replace(/\s*\n\s*/g,'\n').trim();
  }
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
  function warningTime(hour,minute,day,month,year){
    const wall=Date.UTC(year,month-1,day,hour,minute),check=new Date(wall);if(check.getUTCFullYear()!==year||check.getUTCMonth()!==month-1||check.getUTCDate()!==day||hour>23||minute>59)throw Error('Invalid warning date');
    let at=wall;for(let i=0;i<2;i++){const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Dublin',timeZoneName:'shortOffset'}).formatToParts(new Date(at)),zone=parts.find(p=>p.type==='timeZoneName')?.value||'GMT',offset=zone.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);at=wall-(offset?(offset[1]==='-'?-1:1)*(Number(offset[2])*60+Number(offset[3]||0))*60000:0);}return new Date(at).toISOString();
  }
  function parseBulletin(html){
    const match=String(html||'').match(/<h2\b[^>]*>\s*Weather\s+Warnings\s*<\/h2>([\s\S]*?)(?=<h2\b[^>]*>\s*(?:Marine Warnings|Environmental Advisories)\s*<\/h2>|$)/i);
    if(!match)throw Error('Official weather warning section missing');
    const section=plainText(match[1]);if(/currently no warnings in operation|no weather warnings|no warnings in force/i.test(section))return [];
    const headings=[...section.matchAll(/^(?:Status\s*:?\s+)?(Yellow|Orange|Red)\s*[-–]\s*([^\n]+)/gim)];if(!headings.length)throw Error('Official warning bulletin could not be verified');
    return headings.flatMap((m,i)=>{const area=m[2],block=section.slice(m.index,headings[i+1]?.index||section.length),relevant=/\b(Wexford|Leinster|nationwide|all counties)\b/i.test(area)||/\b(?:for|across)\s+(?:all\s+(?:of\s+)?)?Ireland\b/i.test(area);if(!relevant)return [];
      const validity=block.match(/Valid\s*:?\s*([^\n]+)/i)?.[1]||'',dates=[...validity.matchAll(/(\d{1,2}):(\d{2})\s+(?:[A-Za-z]+\s+)?(\d{1,2})\/(\d{1,2})\/(\d{4})/g)];if(dates.length!==2)throw Error('Warning validity unavailable');const [onset,expires]=dates.map(d=>warningTime(...d.slice(1).map(Number)));if(Date.parse(expires)<=Date.parse(onset))throw Error('Invalid warning interval');return [{level:m[1],headline:'Status '+m[1]+' - '+area.trim(),description:block.split(/Valid\s*:/i)[0].slice(m[0].length).trim(),onset,expires}];});
  }
  async function fetchOfficial(signal){const source='https://www.met.ie/warnings-today.html',response=await window.fetch(source,{cache:'no-store',mode:'cors',signal});if(!response.ok)throw Error('Official warning bulletin unavailable');const warnings=select(parseBulletin(await response.text()));return {county:'Wexford',warnings,source,checked_at:new Date().toISOString(),recovery_source:'Official bulletin read directly'};}
  window.ParknacrossWarnings = {select,plainText,parseBulletin,fetchOfficial};
})();
