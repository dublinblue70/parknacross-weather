'use strict';
 function motionBetween(older,newer){
  const w=older.width,limit=48,step=2;
  let best={score:0,dx:0,dy:0,overlap:0};
  for(let dy=-limit;dy<=limit;dy+=step)for(let dx=-limit;dx<=limit;dx+=step){
   let intersection=0,union=0;
   for(let y=50;y<w-50;y+=3){
    const yy=y+dy;if(yy<0||yy>=w)continue;
    for(let x=50;x<w-50;x+=3){
     const xx=x+dx;if(xx<0||xx>=w)continue;
     const a=older.mask[y*w+x],b=newer.mask[yy*w+xx];
     if(a||b)union++;if(a&&b)intersection++;
    }
   }
   if(intersection<6||!union)continue;
   const score=intersection/union;
   if(score>best.score)best={score,dx,dy,overlap:intersection};
  }
  return best;
 }
 function arrivalFromMasks(older,newer,minutes){
  const w=newer.width,sx=newer.sx,sy=newer.sy,latest=newer.mask;
  let nearEcho=0,areaEcho=0;
  for(let y=0;y<w;y+=2)for(let x=0;x<w;x+=2){
   if(!latest[y*w+x])continue;
   const d=Math.hypot(x-sx,y-sy);
   if(d<=9)nearEcho++;
   if(d<=125)areaEcho++;
  }
  if(nearEcho>2)return {kind:"now",nearEcho,areaEcho};
  if(areaEcho<3)return {kind:"dry",nearEcho,areaEcho};
  const motion=motionBetween(older,newer),speed=Math.hypot(motion.dx,motion.dy)/minutes;
  if(motion.score<0.12||speed<0.08||speed>2.5)return {kind:"uncertain",motion,nearEcho,areaEcho};
  const vx=motion.dx/minutes,vy=motion.dy/minutes,v2=vx*vx+vy*vy,candidates=[];
  for(let y=0;y<w;y+=2)for(let x=0;x<w;x+=2){
   if(!latest[y*w+x])continue;
   const ox=sx-x,oy=sy-y,d=Math.hypot(ox,oy);
   if(d<12||d>125)continue;
   const t=(ox*vx+oy*vy)/v2;
   if(t<=0||t>60)continue;
   const miss=Math.hypot(ox-vx*t,oy-vy*t);
   if(miss<=10)candidates.push(t);
  }
  if(!candidates.length)return {kind:"none",motion,nearEcho,areaEcho};
  candidates.sort((a,b)=>a-b);
  const first=candidates[0],coherent=candidates.filter(t=>t<=first+8).length;
  if(coherent<4)return {kind:"uncertain",motion,nearEcho,areaEcho};
  return {kind:"arrival",minutes:first,confidence:motion.score>=0.25&&coherent>=12?"moderate":"low",motion,nearEcho,areaEcho};
 }

self.onmessage=event=>{try{const {older,newer,minutes}=event.data;self.postMessage({result:arrivalFromMasks(older,newer,minutes)});}catch{self.postMessage({error:'Radar motion analysis failed'});}};
