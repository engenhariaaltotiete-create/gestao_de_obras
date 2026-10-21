import {executionPercent,newWork,type Work} from './model';
import MapEditor from './MapEditor';

type Sketch=Pick<Work,'id'|'address'|'points'|'lines'|'segments'>;
export const sketchProgress=(item:Sketch)=>Math.min(100,Math.max(0,executionPercent({...newWork(),...item,manualLength:null})));
export function ProgressBar({value,onClick}:{value:number;onClick:()=>void}){
 const n=Math.round(value*10)/10;
 return <button type="button" className="program-progress" onClick={e=>{e.stopPropagation();onClick()}} title="Visualizar croqui" aria-label={`Execução ${n}% — visualizar croqui`}><span className={`program-progress-fill ${n===100?'complete':n<40?'low':''}`} style={{width:`${n}%`}}/><span className="program-progress-label">{n.toLocaleString('pt-BR')}%</span></button>;
}
export function SketchPreview({item,onClose}:{item:Sketch;onClose:()=>void}){
 return <div className="diagnostic-modal" onClick={onClose}><div className="diagnostic-modal-content sketch-preview" role="dialog" aria-modal="true" aria-label={`Croqui de ${item.address}`} onClick={e=>e.stopPropagation()}><div className="sketch-preview-header"><h2>Croqui — {item.address}</h2><button type="button" onClick={onClose} aria-label="Fechar croqui">✕</button></div><MapEditor work={{...newWork(),...item}} readOnly onChange={()=>{}}/></div></div>;
}
