/** Rasterizes OpenStreetMap tiles with work segments. Tile errors keep the vector overlay usable. */
import type { jsPDF } from 'jspdf';
type Data=Record<string,unknown>;
const list=(x:unknown):Data[]=>Array.isArray(x)?x.filter((v):v is Data=>!!v&&typeof v==='object'&&!Array.isArray(v)):[];
const n=(x:unknown)=>Number(x)||0;
const fmt=(x:number)=>x.toLocaleString('pt-BR',{maximumFractionDigits:1});
const merc=(lat:number,lng:number,z:number)=>{const s=2**z;const cl=Math.max(-85,Math.min(85,lat));return {x:(lng+180)/360*s,y:(1-Math.log(Math.tan(cl*Math.PI/180)+1/Math.cos(cl*Math.PI/180))/Math.PI)/2*s};};
const load=(url:string)=>new Promise<HTMLImageElement|null>(resolve=>{const image=new Image();image.crossOrigin='anonymous';const timeout=setTimeout(()=>resolve(null),4500);image.onload=()=>{clearTimeout(timeout);resolve(image);};image.onerror=()=>{clearTimeout(timeout);resolve(null);};image.src=url;});
export async function drawWorkMap(doc:jsPDF,record:Data,x:number,y:number,w:number,h:number){
 const points=list(record.points).filter(p=>Number.isFinite(Number(p.lat))&&Number.isFinite(Number(p.lng)));
 const segments=list(record.segments);const lookup=new Map(points.map(p=>[String(p.id),p]));
 const coords=segments.flatMap(s=>[lookup.get(String(s.from)),lookup.get(String(s.to))]).filter((p):p is Data=>!!p);
 const valid=coords.length?coords:points;
 if(!valid.length){doc.setFontSize(9);doc.text('Sem coordenadas para exibir o croqui.',x+4,y+12);return;}
 const canvas=document.createElement('canvas');const scale=4;canvas.width=Math.round(w*scale);canvas.height=Math.round(h*scale);
 const ctx=canvas.getContext('2d');if(!ctx)return;
 ctx.fillStyle='#eef3f4';ctx.fillRect(0,0,canvas.width,canvas.height);
 const minLat=Math.min(...valid.map(p=>Number(p.lat))),maxLat=Math.max(...valid.map(p=>Number(p.lat)));
 const minLng=Math.min(...valid.map(p=>Number(p.lng))),maxLng=Math.max(...valid.map(p=>Number(p.lng)));
 const centerLat=(minLat+maxLat)/2,centerLng=(minLng+maxLng)/2;
 const pad=Math.max(42,Math.min(canvas.width,canvas.height)*0.08);let zoom=2;
 for(let z=18;z>=2;z--){const a=merc(maxLat,minLng,z),b=merc(minLat,maxLng,z);if((b.x-a.x)*256<canvas.width-2*pad&&(b.y-a.y)*256<canvas.height-2*pad){zoom=z;break;}}
 const center=merc(centerLat,centerLng,zoom);const toPx=(p:Data)=>{const t=merc(Number(p.lat),Number(p.lng),zoom);return [(t.x-center.x)*256+canvas.width/2,(t.y-center.y)*256+canvas.height/2] as const;};
 const topLeftX=center.x-canvas.width/512,topLeftY=center.y-canvas.height/512;
 const minX=Math.floor(topLeftX),maxX=Math.floor(topLeftX+canvas.width/256),minY=Math.floor(topLeftY),maxY=Math.floor(topLeftY+canvas.height/256);
 const jobs:Promise<void>[]=[];
 for(let tx=minX;tx<=maxX;tx++)for(let ty=minY;ty<=maxY;ty++){
  if(tx<0||ty<0||tx>=2**zoom||ty>=2**zoom)continue;
  const dx=(tx-topLeftX)*256,dy=(ty-topLeftY)*256;
  jobs.push(load(`https://tile.openstreetmap.org/${zoom}/${tx}/${ty}.png`).then(img=>{if(img)ctx.drawImage(img,dx,dy,256,256);}));
 }
 await Promise.all(jobs);
 // Draw segments first. Place compact, rotated length labels above their lines.
 // Labels are tested against previously placed labels and every segment.
 const paths: {ax:number;ay:number;bx:number;by:number;done:boolean;length:number}[]=[];
 for(const s of segments){const a=lookup.get(String(s.from)),b=lookup.get(String(s.to));if(!a||!b)continue;
  const [ax,ay]=toPx(a),[bx,by]=toPx(b);paths.push({ax,ay,bx,by,done:String(s.status).toUpperCase()==='CONCLUÍDO',length:n(s.manual??s.calculated)});
 }
 for(const p of paths){ctx.strokeStyle=p.done?'#218e53':'#216bad';ctx.lineWidth=5;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(p.ax,p.ay);ctx.lineTo(p.bx,p.by);ctx.stroke();}
 for(const p of paths){ctx.fillStyle=p.done?'#218e53':'#216bad';for(const [px,py] of [[p.ax,p.ay],[p.bx,p.by]]){ctx.beginPath();ctx.arc(px,py,6,0,Math.PI*2);ctx.fill();}}
 type Box={cx:number;cy:number;w:number;h:number;angle:number};
 const placed:Box[]=[];
 const corners=(b:Box)=>{const co=Math.cos(b.angle),si=Math.sin(b.angle);return [[-b.w/2,-b.h/2],[b.w/2,-b.h/2],[b.w/2,b.h/2],[-b.w/2,b.h/2]].map(([xx,yy])=>[b.cx+xx*co-yy*si,b.cy+xx*si+yy*co]);};
 const intersect=(a:Box,b:Box)=>{const ac=corners(a),bc=corners(b);for(const poly of [ac,bc])for(let i=0;i<4;i++){const j=(i+1)%4,dx=poly[j][0]-poly[i][0],dy=poly[j][1]-poly[i][1],axis=[-dy,dx];const proj=(pts:number[][])=>pts.map(pt=>pt[0]*axis[0]+pt[1]*axis[1]);const aa=proj(ac),bb=proj(bc);if(Math.max(...aa)<Math.min(...bb)||Math.max(...bb)<Math.min(...aa))return false;}return true;};
 const dist=(px:number,py:number,p:{ax:number;ay:number;bx:number;by:number})=>{const dx=p.bx-p.ax,dy=p.by-p.ay,den=dx*dx+dy*dy||1,t=Math.max(0,Math.min(1,((px-p.ax)*dx+(py-p.ay)*dy)/den));return Math.hypot(px-p.ax-t*dx,py-p.ay-t*dy);};
 const blocked=(box:Box)=>{const cs=corners(box);if(cs.some(([xx,yy])=>xx<5||yy<5||xx>canvas.width-5||yy>canvas.height-5))return true;
  if(placed.some(other=>intersect(box,other)))return true;
  // Keep the entire label away from the linework, not just its center.
  const samples=[...cs,[box.cx,box.cy],...cs.map((v,i)=>[(v[0]+cs[(i+1)%4][0])/2,(v[1]+cs[(i+1)%4][1])/2])];
  return paths.some(path=>samples.some(([xx,yy])=>dist(xx,yy,path)<7));};
 // Longest segments first to give the most important labels room.
 for(const p of [...paths].sort((a,b)=>Math.hypot(b.bx-b.ax,b.by-b.ay)-Math.hypot(a.bx-a.ax,a.by-a.ay))){
  const dx=p.bx-p.ax,dy=p.by-p.ay,len=Math.hypot(dx,dy);if(len<8)continue;
  let angle=Math.atan2(dy,dx);if(angle>Math.PI/2)angle-=Math.PI;if(angle< -Math.PI/2)angle+=Math.PI;
  const nx=-Math.sin(angle),ny=Math.cos(angle),label=`${Math.round(p.length).toLocaleString('pt-BR')} m`;
  let chosen:Box|null=null,chosenFont=0;
  for(const fontSize of [15,14,13,12,11]){ctx.font=`bold ${fontSize}px Arial`;const tw=ctx.measureText(label).width;const width=tw+7,height=fontSize+5;
   for(const offset of [16,22,29,38,49]){for(const side of [-1,1]){for(const along of [0,-0.2,0.2,-0.35,0.35]){
    const box={cx:(p.ax+p.bx)/2+dx*along+nx*offset*side,cy:(p.ay+p.by)/2+dy*along+ny*offset*side,w:width,h:height,angle};
    if(!blocked(box)){chosen=box;chosenFont=fontSize;break;}
   }if(chosen)break;}if(chosen)break;}if(chosen)break;
  }
  if(!chosen)continue; // Never overlap lines or labels just to show a value.
  placed.push(chosen);ctx.save();ctx.translate(chosen.cx,chosen.cy);ctx.rotate(chosen.angle);
  ctx.fillStyle='rgba(255,255,255,.96)';ctx.fillRect(-chosen.w/2,-chosen.h/2,chosen.w,chosen.h);
  ctx.font=`bold ${chosenFont}px Arial`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#152b3d';ctx.fillText(label,0,0);ctx.restore();
 }
 const total=segments.reduce((s,t)=>s+n(t.manual??t.calculated),0);
 const done=segments.filter(s=>String(s.status).toUpperCase()==='CONCLUÍDO').reduce((a,s)=>a+n(s.manual??s.calculated),0);
 ctx.fillStyle='rgba(255,255,255,.95)';ctx.fillRect(canvas.width-245,12,231,77);
 ctx.textAlign='left';ctx.font='bold 16px Arial';ctx.fillStyle='#172e40';ctx.fillText(`Total: ${fmt(total)} m`,canvas.width-232,34);
 ctx.fillStyle='#18884e';ctx.fillText(`Executada: ${fmt(done)} m`,canvas.width-232,56);
 ctx.fillStyle='#246caf';ctx.fillText(`A executar: ${fmt(total-done)} m`,canvas.width-232,78);
 try{doc.addImage(canvas.toDataURL('image/jpeg',.85),'JPEG',x,y,w,h);}catch{doc.setFontSize(8);doc.text('Não foi possível incorporar o mapa-base.',x+3,y+8);}
 doc.setFontSize(6);doc.setTextColor(80,100,120);doc.text('© OpenStreetMap contributors',x+2,y+h-2);
}
