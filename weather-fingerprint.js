(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const metrics = [
    {key:'high_c', label:'Temperature high', unit:'°C', color:'#ff8c78', min:-5, max:30},
    {key:'rain_mm', label:'Rainfall', unit:'mm', color:'#65caff', min:0, max:30},
    {key:'peak_gust_kmh', label:'Peak gust', unit:'km/h', color:'#78dfc0', min:0, max:100},
    {key:'solar_peak_w_m2', label:'Solar peak', unit:'W/m²', color:'#f4d36f', min:0, max:1000}
  ];
  const today = () => new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Dublin'}).format(new Date());
  const value = (row, metric) => {
    const raw=row?.[metric.key];
    if(raw === null || raw === undefined || String(raw).trim() === '' || !Number.isFinite(Number(raw)))return null;
    const n=Number(raw);
    return n < (metric.key === 'high_c' ? -50 : 0) || n > ({high_c:60,rain_mm:1000,peak_gust_kmh:300,solar_peak_w_m2:1600}[metric.key]) ? null : n;
  };
  const amount = (n,m) => Math.max(0,Math.min(1,(n-m.min)/(m.max-m.min)));
  const dateLabel = day => new Date(day+'T12:00:00Z').toLocaleDateString('en-IE',{timeZone:'Europe/Dublin',day:'numeric',month:'long',year:'numeric'});
  const fmt = (n,m) => n === null ? 'Not recorded' : `${n.toLocaleString('en-IE',{maximumFractionDigits:m.key==='solar_peak_w_m2'?0:1})} ${m.unit}`;
  let archive=new Map(), selected='', year=Number(today().slice(0,4));
  function fingerprint(row,size=36) {
    const paths=metrics.map((m,i)=>{
      const n=value(row,m), start=(-90+i*90+5)*Math.PI/180, end=(-90+(i+1)*90-5)*Math.PI/180;
      const wedge=r=>`M18 18 L${18+r*Math.cos(start)} ${18+r*Math.sin(start)} A${r} ${r} 0 0 1 ${18+r*Math.cos(end)} ${18+r*Math.sin(end)} Z`;
      return `<path d="${wedge(16)}" fill="#1e3040"/>`+(n===null?`<path d="${wedge(16)}" fill="none" stroke="#7c8995" stroke-width=".7" stroke-dasharray="1.2 2"/>`:`<path d="${wedge(5+11*amount(n,m))}" fill="${m.color}"/>`);
    }).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36" width="${size}" height="${size}" aria-hidden="true">${paths}<circle cx="18" cy="18" r="2.2" fill="#0c1722"/></svg>`;
  }
  function select(day,focus=false) {
    selected=day;
    const row=archive.get(day);
    $('fingerprintDate').textContent=dateLabel(day)+(day===today()?' · so far':'');
    $('fingerprintPortrait').innerHTML=fingerprint(row,100);
    $('fingerprintValues').replaceChildren(...metrics.map(m=>{
      const div=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');
      dt.textContent=m.label;dd.textContent=fmt(value(row,m),m);div.append(dt,dd);return div;
    }));
    const link=$('fingerprintArchive');link.hidden=!row;link.href=`history.html?day=${day}#dayDetailTitle`;
    $('fingerprintDayNote').textContent=row?'Available daily observations; gaps may affect totals and extremes.':'No station observations saved for this date.';
    document.querySelectorAll('.fingerprint-day').forEach(b=>{b.setAttribute('aria-pressed',String(b.dataset.day===day));b.tabIndex=b.dataset.day===day?0:-1;});
    if(focus)document.querySelector(`.fingerprint-day[data-day="${day}"]`)?.focus();
  }
  function renderYear() {
    year=Number($('fingerprintYear').value);
    const grid=$('fingerprintGrid');grid.replaceChildren();
    const head=document.createElement('div');head.className='fingerprint-row fingerprint-numbers';head.setAttribute('aria-hidden','true');
    head.append(document.createElement('span'));
    for(let d=1;d<=31;d++){const s=document.createElement('span');s.textContent=d;head.append(s);}grid.append(head);
    let recorded=0;
    for(let month=1;month<=12;month++){
      const row=document.createElement('div');row.className='fingerprint-row';
      const label=document.createElement('span');label.className='fingerprint-month';label.textContent=new Date(Date.UTC(year,month-1,1)).toLocaleDateString('en-IE',{month:'short',timeZone:'UTC'});row.append(label);
      const last=new Date(Date.UTC(year,month,0)).getUTCDate();
      for(let d=1;d<=31;d++){
        const day=`${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        if(d>last||day>today()){const blank=document.createElement('span');blank.className='fingerprint-blank';row.append(blank);continue;}
        const data=archive.get(day),button=document.createElement('button');
        if(data)recorded++;
        button.type='button';button.className='fingerprint-day'+(data?'':' fingerprint-missing');button.dataset.day=day;
        const description=`${dateLabel(day)}${day===today()?', day in progress':''}: `+(data?metrics.map(m=>`${m.label} ${fmt(value(data,m),m)}`).join(', '):'No saved observations');
        button.setAttribute('aria-label',description);button.title=description;button.innerHTML=fingerprint(data);button.addEventListener('click',()=>select(day));
        button.addEventListener('keydown',e=>{
          const step={ArrowLeft:-1,ArrowRight:1,ArrowUp:-31,ArrowDown:31}[e.key];if(!step)return;e.preventDefault();
          const buttons=[...grid.querySelectorAll('.fingerprint-day')],index=buttons.indexOf(button),target=buttons[Math.max(0,Math.min(buttons.length-1,index+step))];select(target.dataset.day,true);
        });row.append(button);
      }grid.append(row);
    }
    $('fingerprintStatus').textContent=`${year} · ${recorded} day${recorded===1?'':'s'} with saved observations${year===Number(today().slice(0,4))?' · year in progress':''}. Dotted segments mean not recorded; future dates are blank.`;
    const days=[...archive.keys()].filter(d=>d.startsWith(String(year))).sort();
    const fallback=year===Number(today().slice(0,4))?today():`${year}-12-31`;
    select(selected.startsWith(String(year))?selected:days.at(-1)||fallback);
    $('fingerprintDownload').disabled=recorded===0;
  }
  async function download() {
    const button=$('fingerprintDownload');button.disabled=true;
    try {
      const cells=[];
      for(let month=1;month<=12;month++){
        const label=new Date(Date.UTC(year,month-1,1)).toLocaleDateString('en-IE',{month:'short',timeZone:'UTC'});
        cells.push(`<text x="45" y="${177+(month-1)*48}" fill="#acbdc9" font-size="16">${label}</text>`);
        const last=new Date(Date.UTC(year,month,0)).getUTCDate();
        for(let day=1;day<=last;day++){
          const key=`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;if(key>today())continue;
          cells.push(`<g transform="translate(${100+(day-1)*34},${151+(month-1)*48})">${fingerprint(archive.get(key),30)}</g>`);
        }
      }
      const legends=metrics.map((m,i)=>`<circle cx="${55+i*285}" cy="785" r="5" fill="${m.color}"/><text x="${68+i*285}" y="790" fill="#d5e2ea" font-size="16">${m.label} · ${m.min}–${m.max} ${m.unit}</text>`).join('');
      const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="880"><rect width="1200" height="880" fill="#0c1722"/><g font-family="sans-serif"><text x="45" y="52" fill="#81d7ee" font-size="18" letter-spacing="3">PARKNACROSS WEATHER</text><text x="45" y="100" fill="#edf5fa" font-size="34">${year} · The weather fingerprint</text><text x="45" y="128" fill="#acbdc9" font-size="16">Ardamine, North Wexford · Recorded daily highs, rainfall, peak gusts and solar peaks</text>${Array.from({length:31},(_,i)=>`<text x="${110+i*34}" y="149" fill="#acbdc9" font-size="11">${i+1}</text>`).join('')}${cells.join('')}${legends}<text x="45" y="829" fill="#acbdc9" font-size="14">Clockwise from top right: temperature, rain, wind, solar. Larger segments = higher values; dotted = not recorded.</text><text x="45" y="853" fill="#acbdc9" font-size="14">parknacrossweather.ie · ${today()} · Available observations; incomplete days may affect values.</text></g></svg>`;
      const url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'}));
      try {
        const img=new Image();img.src=url;await img.decode();const canvas=document.createElement('canvas');canvas.width=2400;canvas.height=1760;canvas.getContext('2d').drawImage(img,0,0,2400,1760);
        const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw Error('Image unavailable');
        const png=URL.createObjectURL(blob),a=document.createElement('a');a.href=png;a.download=`parknacross-weather-fingerprint-${year}.png`;a.click();setTimeout(()=>URL.revokeObjectURL(png),10000);
      } finally {URL.revokeObjectURL(url);}
    } catch(_) {$('fingerprintStatus').textContent='The image could not be created. Please try Download image again.';}
    finally {button.disabled=false;}
  }
  window.ParknacrossFingerprint={
    render(rows) {
      archive=new Map((Array.isArray(rows)?rows:[]).filter(r=>{
        const d=String(r?.day||'');return /^\d{4}-\d{2}-\d{2}$/.test(d)&&d<=today()&&!Number.isNaN(Date.parse(d+'T12:00:00Z'));
      }).map(r=>[r.day,r]));
      const years=[...new Set([Number(today().slice(0,4)),...[...archive.keys()].map(d=>Number(d.slice(0,4)))])].sort((a,b)=>b-a);
      const picker=$('fingerprintYear');picker.replaceChildren(...years.map(y=>new Option(String(y),String(y))));picker.value=String(years[0]);picker.disabled=false;
      renderYear();
    },
    unavailable() {$('fingerprintStatus').textContent='The daily archive could not be loaded. Reload the page to try again.';$('fingerprintDayNote').textContent='Saved station observations are temporarily unavailable.';}
  };
  $('fingerprintYear')?.addEventListener('change',renderYear);
  $('fingerprintDownload')?.addEventListener('click',download);
})();
