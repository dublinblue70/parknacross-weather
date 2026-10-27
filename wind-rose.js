(() => {
  const LABELS = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
  const CALM_THRESHOLD_KMH = 1;

  const usable = value =>
    value !== null &&
    value !== undefined &&
    value !== "" &&
    Number.isFinite(Number(value));

  const BUCKET_SECONDS = 300;
  // One representative reading per UTC five-minute slot. The most recent
  // valid reading wins, regardless of archive insertion order.
  function distribution(rows, options = {}) {
    const bins = new Array(LABELS.length).fill(0);
    const endEpoch = Number.isFinite(Number(options.endEpoch)) && options.endEpoch != null
      ? Math.floor(Number(options.endEpoch) / BUCKET_SECONDS) * BUCKET_SECONDS
      : Math.floor(Date.now() / 1000 / BUCKET_SECONDS) * BUCKET_SECONDS;
    const hours = Number(options.hours);
    const startEpoch = Number.isFinite(hours) && hours > 0 ? endEpoch - hours * 3600 : -Infinity;
    const slots = new Map();
    for (const row of rows || []) {
      const epoch = Number(row?.epoch ?? (row?.received_at ? Date.parse(row.received_at) / 1000 : NaN));
      if (!Number.isFinite(epoch) || epoch < startEpoch || epoch >= endEpoch) continue;
      if (!usable(row?.wind_direction_deg) || !usable(row?.wind_speed_kmh)) continue;
      const speed = Number(row.wind_speed_kmh);
      const degrees = Number(row.wind_direction_deg);
      if (speed < 0 || !Number.isFinite(degrees) || degrees < 0 || degrees > 360) continue;
      const bucket = Math.floor(epoch / BUCKET_SECONDS);
      const previous = slots.get(bucket);
      if (!previous || epoch >= previous.epoch) slots.set(bucket, {epoch, speed, degrees, gust:usable(row.wind_gust_kmh)&&Number(row.wind_gust_kmh)>=0?Number(row.wind_gust_kmh):null});
    }
    const speedSums = new Array(LABELS.length).fill(0);
    const bandCounts=SPEED_BANDS.map(()=>new Array(LABELS.length).fill(0));
    let directional = 0, calm = 0, maxSpeed=null, maxGust=null;
    for (const {speed, degrees, gust} of slots.values()) {
      maxSpeed=Math.max(maxSpeed??0,speed);if(gust!==null)maxGust=Math.max(maxGust??0,gust);
      if (speed < CALM_THRESHOLD_KMH) { calm++; continue; }
      const index = Math.round((degrees % 360) / 22.5) % LABELS.length;
      bins[index]++;
      bandCounts[SPEED_BANDS.findIndex(band=>speed<band.max)][index]++;
      speedSums[index] += speed;
      directional++;
    }
    return {bins, calm, directional, intervalCount: slots.size, bandCounts, maxSpeed, maxGust,
      bandPercentages:bandCounts.map(counts=>counts.map(count=>directional?count/directional*100:0)),
      meanSpeeds: bins.map((count, index) => count ? speedSums[index] / count : null),
      percentages: bins.map(count => directional ? count / directional * 100 : 0)};
  }

  const SPEED_BANDS = [
    {max:5, label:"1–5", color:"#91d8f7"},
    {max:15, label:"5–15", color:"#3f8cff"},
    {max:25, label:"15–25", color:"#20c5b0"},
    {max:40, label:"25–40", color:"#ffd052"},
    {max:Infinity, label:"40+", color:"#fb4a9c"}
  ];

  // Use the Chart.js arc elements for both rendering and pointer hit testing.
  // The central hole is reserved space, so it never counts towards spoke length.
  const spokeLayout = {
    id:"parknacrossWindSpokes",
    afterDatasetUpdate(chart, args) {
      const r=chart.scales.r, radius=r.drawingArea, hole=radius*.22;
      const maximum=chart.$windRoseMaximum || 10;
      args.meta.data.forEach((arc,index)=>{
        const frequency=Number(chart.data.datasets[args.index].data[index] || 0);
        const before=chart.data.datasets.slice(0,args.index).reduce((sum,dataset)=>sum+Number(dataset.data[index]||0),0);
        Object.assign(arc,{
          x:r.xCenter,y:r.yCenter,innerRadius:hole+(radius-hole)*before/maximum,
          outerRadius:hole+(radius-hole)*(before+frequency)/maximum,
          startAngle:(index*22.5-90-9)*Math.PI/180,
          endAngle:(index*22.5-90+9)*Math.PI/180
        });
      });
    },
    beforeDatasetsDraw(chart) {
      const {ctx,scales:{r}}=chart, radius=r.drawingArea, hole=radius*.22;
      ctx.save();ctx.strokeStyle="rgba(173,201,219,.18)";ctx.lineWidth=1;
      for(const size of [hole,hole+(radius-hole)*.5,radius]){
        ctx.beginPath();ctx.arc(r.xCenter,r.yCenter,size,0,Math.PI*2);ctx.stroke();
      }
      ctx.restore();
    },
    afterDatasetsDraw(chart) {
      const {ctx,scales:{r}}=chart, radius=r.drawingArea, hole=radius*.22, result=chart.$windRose;
      ctx.save();ctx.fillStyle="#0b1925";ctx.beginPath();ctx.arc(r.xCenter,r.yCenter,hole-1,0,Math.PI*2);ctx.fill();
      ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillStyle="#eaf3fa";
      const text=result?.intervalCount ? `${Math.round(result.calm/result.intervalCount*100)}%` : "—";
      ctx.font=`700 ${Math.max(14,Math.min(23,hole*.66))}px system-ui`;ctx.fillText(text,r.xCenter,r.yCenter-9);
      ctx.fillStyle="#a8bfce";ctx.font=`500 ${Math.max(8,Math.min(10,hole*.31))}px system-ui`;
      if(result?.intervalCount){ctx.fillText("calm",r.xCenter,r.yCenter+7);ctx.fillText("readings",r.xCenter,r.yCenter+18);}
      else ctx.fillText("no data",r.xCenter,r.yCenter+12);
      ctx.fillStyle="#dce9f2";ctx.font="700 12px system-ui";
      for(const [label,dx,dy] of [["N",0,-1],["E",1,0],["S",0,1],["W",-1,0]])ctx.fillText(label,r.xCenter+dx*(radius+18),r.yCenter+dy*(radius+18));
      ctx.restore();
    }
  };

  function create(canvas) {
    if (!canvas || typeof Chart === "undefined") return null;
    const wrap=canvas.closest('.wind-rose-wrap');
    if(wrap && !wrap.nextElementSibling?.classList.contains('wind-rose-legend')){
      const legend=document.createElement('div');legend.className='wind-rose-legend';legend.setAttribute('aria-label','Sustained wind speed bands in kilometres per hour');
      SPEED_BANDS.forEach(band=>{
        const item=document.createElement('span'),swatch=document.createElement('i');swatch.style.backgroundColor=band.color;swatch.setAttribute('aria-hidden','true');item.append(swatch,document.createTextNode(band.label));legend.append(item);
      });
      const units=document.createElement('span');units.className='wind-rose-unit';units.textContent='km/h';legend.append(units);wrap.after(legend);
      const calmNote=document.createElement('p');calmNote.className='wind-rose-calm-note';calmNote.textContent='The centre shows the percentage of valid five-minute readings below 1 km/h (calm).';legend.after(calmNote);
      const explanation=document.createElement('p');explanation.className='wind-rose-explanation';explanation.textContent='Longer spokes show where the wind blew from more often. Coloured segments show how often sustained wind fell in each speed band; gusts are listed separately.';calmNote.after(explanation);
    }
    return new Chart(canvas, {
      type:"polarArea",
      plugins:[spokeLayout],
      data:{labels:[...LABELS],datasets:SPEED_BANDS.map(band=>({
        label:`${band.label} km/h sustained · %`,data:new Array(LABELS.length).fill(0),
        backgroundColor:band.color,borderWidth:0,hoverBorderColor:"#ffffff",hoverBorderWidth:1
      }))},
      options:{
        maintainAspectRatio:false,animation:false,layout:{padding:30},
        scales:{r:{display:false,beginAtZero:true,min:0,max:100}},
        plugins:{
          legend:{display:false},
          tooltip:{
            displayColors:true,
            callbacks:{
              title:items=>`${items[0]?.label || ""} · wind from`,
              label:context=>{
                const result=context.chart.$windRose,index=context.dataIndex,speed=result?.meanSpeeds[index];
                return [`${SPEED_BANDS[context.datasetIndex].label} km/h sustained wind`,
                  `${Number(context.raw || 0).toFixed(1)}% of non-calm intervals`,
                  `${result?.bandCounts[context.datasetIndex][index] || 0} five-minute intervals in this band`,
                  speed==null ? 'Direction average unavailable' : `Direction average ${speed.toFixed(1)} km/h`];
              }
            }
          }
        }
      }
    });
  }

  function update(chart, rows, metaElement, options = {}) {
    const result = distribution(rows, options);
    if(!chart)return result;
    chart.$windRose=result;
    const maximum=Math.max(10,Math.ceil(Math.max(...result.percentages)/10)*10);
    chart.$windRoseMaximum=maximum;
    chart.data.datasets.forEach((dataset,index)=>{dataset.data=result.bandPercentages[index];});
    chart.update('none');
    const calmPercent=result.intervalCount ? result.calm/result.intervalCount*100 : 0;
    const calmNote=chart.canvas.closest('.wind-rose-wrap')?.parentElement?.querySelector('.wind-rose-calm-note');
    if(calmNote)calmNote.textContent=result.intervalCount
      ? `Centre: ${Math.round(calmPercent)}% of valid five-minute readings had wind below ${CALM_THRESHOLD_KMH} km/h (calm) during this period.`
      : `The centre shows the percentage of valid five-minute readings below ${CALM_THRESHOLD_KMH} km/h (calm).`;
    const summary=result.intervalCount
      ? `${result.intervalCount.toLocaleString('en-IE')} valid five-minute intervals · outer ring ${maximum}% of non-calm intervals. Highest sustained reading: ${result.maxSpeed.toFixed(1)} km/h${result.maxGust===null?'':`; peak gust: ${result.maxGust.toFixed(1)} km/h`}.`
      : 'No usable wind-direction observations in this period.';
    if(metaElement)metaElement.textContent=summary;
    chart.canvas.setAttribute('aria-label',result.intervalCount
      ? `Wind rose: ${calmPercent.toFixed(1)}% calm. This is the share of valid five-minute readings with wind below ${CALM_THRESHOLD_KMH} km/h during this period. `+LABELS.map((label,i)=>result.bins[i] ? `${label}: ${result.percentages[i].toFixed(1)}% of non-calm intervals, average ${result.meanSpeeds[i].toFixed(1)} km/h; `+SPEED_BANDS.map((band,j)=>result.bandCounts[j][i]?`${band.label} km/h: ${result.bandCounts[j][i]} intervals`:null).filter(Boolean).join(', ')+'.' : '').filter(Boolean).join(' ')
      : 'Wind rose: no usable observations in this period.');
    return result;
  }

  window.ParknacrossWindRose = Object.freeze({
    labels: [...LABELS],
    calmThresholdKmh: CALM_THRESHOLD_KMH,
    bucketSeconds: BUCKET_SECONDS,
    distribution,
    create,
    update
  });
})();
