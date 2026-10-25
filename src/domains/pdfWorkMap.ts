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
 // Paint labels first, then paint the linework on top so labels never hide a segment.
 const paths: {ax:number;ay:number;bx:number;by:number;done:boolean}[]=[];
 for(const s of segments){const a=lookup.get(String(s.from)),b=lookup.get(String(s.to));if(!a||!b)continue;
  const [ax,ay]=toPx(a),[bx,by]=toPx(b);const done=String(s.status).toUpperCase()==='CONCLUÍDO';
  paths.push({ax,ay,bx,by,done});
  const mx=(ax+bx)/2,my=(ay+by)/2;
  const lines=[String(s.name||'Trecho'),`${fmt(n(s.manual??s.calculated))} m`];
  ctx.font='bold 11.9px Arial';const width=Math.max(...lines.map(t=>ctx.measureText(t).width))+14;
  ctx.fillStyle='rgba(255,255,255,.9)';ctx.fillRect(mx-width/2,my-17,width,34);
  ctx.fillStyle='#152b3d';ctx.textAlign='center';ctx.fillText(lines[0],mx,my-4);ctx.fillText(lines[1],mx,my+10);
 }
 for(const p of paths){ctx.strokeStyle=p.done?'#218e53':'#216bad';ctx.lineWidth=5;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(p.ax,p.ay);ctx.lineTo(p.bx,p.by);ctx.stroke();}
 const total=segments.reduce((s,t)=>s+n(t.manual??t.calculated),0);
 const done=segments.filter(s=>String(s.status).toUpperCase()==='CONCLUÍDO').reduce((a,s)=>a+n(s.manual??s.calculated),0);
 ctx.fillStyle='rgba(255,255,255,.95)';ctx.fillRect(canvas.width-245,12,231,77);
 ctx.textAlign='left';ctx.font='bold 16px Arial';ctx.fillStyle='#172e40';ctx.fillText(`Total: ${fmt(total)} m`,canvas.width-232,34);
 ctx.fillStyle='#18884e';ctx.fillText(`Executada: ${fmt(done)} m`,canvas.width-232,56);
 ctx.fillStyle='#246caf';ctx.fillText(`A executar: ${fmt(total-done)} m`,canvas.width-232,78);
 try{doc.addImage(canvas.toDataURL('image/jpeg',.85),'JPEG',x,y,w,h);}catch{doc.setFontSize(8);doc.text('Não foi possível incorporar o mapa-base.',x+3,y+8);}
 doc.setFontSize(6);doc.setTextColor(80,100,120);doc.text('© OpenStreetMap contributors',x+2,y+h-2);
}
