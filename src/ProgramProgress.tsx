import {executionPercent, newWork, type Work} from './model';
import {MapContainer, TileLayer, Polyline, useMap} from 'react-leaflet';
import {useEffect, useMemo} from 'react';
import {latLngBounds} from 'leaflet';
import 'leaflet/dist/leaflet.css';

type Sketch = Pick<Work,'id'|'address'|'points'|'lines'|'segments'>;
export const sketchProgress = (item:Sketch) => Math.min(100,Math.max(0,executionPercent({...newWork(),...item,manualLength:null})));
export function ProgressBar({value,onClick}:{value:number;onClick:()=>void}){
 const n=Math.round(value*10)/10;
 return <button type="button" className="program-progress" onClick={e=>{e.stopPropagation();onClick()}} title="Visualizar croqui" aria-label={`Execução ${n}% — visualizar croqui`}><span className={`program-progress-fill ${n===100?'complete':n<40?'low':''}`} style={{width:`${n}%`}}/><span className="program-progress-label">{n.toLocaleString('pt-BR')}%</span></button>;
}
function FitSketch({positions}:{positions:[number,number][][]}){
 const map=useMap();
 useEffect(()=>{const pts=positions.flat();if(pts.length){const bounds=latLngBounds(pts);map.invalidateSize();map.fitBounds(bounds,{padding:[28,28],maxZoom:17});}},[map,positions]);
 return null;
}
export function SketchPreview({item,onClose}:{item:Sketch;onClose:()=>void}){
 const positions=useMemo(()=>{const points=new Map(item.points.map(p=>[p.id,p]));return item.segments.map(s=>{const ids=item.lines.find(l=>l.id===s.lineId)?.pointIds||[s.from,s.to];return {id:s.id,status:s.status,coords:ids.map(id=>points.get(id)).filter((v):v is NonNullable<typeof v>=>!!v).map(v=>[v.lat,v.lng] as [number,number])};}).filter(s=>s.coords.length>1);},[item]);
 return <div className="diagnostic-modal" onClick={onClose}><div className="diagnostic-modal-content sketch-preview" role="dialog" aria-modal="true" aria-label={`Croqui de ${item.address}`} onClick={e=>e.stopPropagation()}><div className="sketch-preview-header"><h2>Croqui — {item.address}</h2><button type="button" onClick={onClose} aria-label="Fechar croqui">✕</button></div>{positions.length?<div className="sketch-preview-map"><MapContainer center={positions[0].coords[0]} zoom={14} style={{height:'100%',width:'100%'}}><TileLayer attribution="© OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"/><FitSketch positions={positions.map(s=>s.coords)}/>{positions.map(s=><Polyline key={s.id} positions={s.coords} pathOptions={{color:s.status==='CONCLUÍDO'?'#16a34a':'#2563eb',weight:6}}/>)}</MapContainer></div>:<p>Este registro não possui trechos com geometria para visualização.</p>}</div></div>;
}
