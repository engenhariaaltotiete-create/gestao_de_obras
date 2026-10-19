import {useMemo,useState} from 'react';
import {executionPercent, statusColor, type Work} from './model';

type Item = Pick<Work,'id'|'address'|'city'|'priority'|'segments'> & {status:string;plannedStart:string;plannedEnd:string};
type FilterKey='city'|'status'|'priority';
type Filters=Record<FilterKey,string[]>;
const empty=():Filters=>({city:[],status:[],priority:[]});
const DAY=86400000;
const parse=(date:string)=>Date.parse(date+'T12:00:00');
const startOfWeek=(ms:number)=>{const d=new Date(ms);const day=(d.getDay()+6)%7;return ms-day*DAY};
const addMonths=(ms:number,n:number)=>{const d=new Date(ms);d.setMonth(d.getMonth()+n);return d.getTime()};
const dateText=(date:string)=>date?new Date(parse(date)).toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'}):'—';
export default function ProgramDashboard<T extends Item>({items,search,onSearch,onOpen,onEdit,statuses,onApply}:{items:T[];search:string;onSearch:(s:string)=>void;onOpen:(id:string)=>void;onEdit:(item:T)=>void;statuses:readonly string[];onApply:(f:Filters)=>void}){
 const [open,setOpen]=useState(false),[field,setField]=useState<FilterKey|null>(null),[draft,setDraft]=useState<Filters>(empty),[applied,setApplied]=useState<Filters>(empty),[optionSearch,setOptionSearch]=useState('');
 const options=useMemo(()=>({city:[...new Set(items.map(i=>i.city).filter(Boolean))].sort(),status:statuses.filter(s=>s!=='CANCELADO'),priority:['Alta','Média','Baixa']}),[items,statuses]);
 const visible=useMemo(()=>items.filter(i=>i.status!=='CANCELADO'&&(!search||[i.address,i.city].join(' ').toLocaleLowerCase().includes(search.toLocaleLowerCase()))&&(['city','status','priority'] as FilterKey[]).every(k=>!applied[k].length||applied[k].includes(i[k]))),[items,search,applied]);
 const dated=visible.filter(i=>i.plannedStart&&i.plannedEnd&&parse(i.plannedEnd)>=parse(i.plannedStart));
 const minDate=dated.length?Math.min(...dated.map(i=>parse(i.plannedStart))):Date.now();
 const maxDate=dated.length?Math.max(...dated.map(i=>parse(i.plannedEnd))):minDate;
 const left=startOfWeek(minDate-7*DAY);
 const right=Math.max(startOfWeek(maxDate+14*DAY),addMonths(left,3));
 const duration=Math.max(DAY,right-left);
 const weeks=Array.from({length:Math.ceil(duration/(7*DAY))},(_,n)=>left+n*7*DAY).filter(ms=>ms<right);
 const months:Array<{name:string;left:number;width:number}>=[];
 let cursor=left;
 while(cursor<right){const d=new Date(cursor);const next=new Date(d.getFullYear(),d.getMonth()+1,1,12).getTime();const end=Math.min(next,right);months.push({name:d.toLocaleDateString('pt-BR',{month:'short',year:'2-digit'}),left:(cursor-left)/duration*100,width:(end-cursor)/duration*100});cursor=end;}
 const grouped=[...new Set(dated.map(i=>i.city||'Não informado'))].sort().map(city=>({city,rows:dated.filter(i=>(i.city||'Não informado')===city).sort((a,b)=>a.address.localeCompare(b.address))}));
 const toggle=(k:FilterKey,value:string)=>setDraft(p=>({...p,[k]:p[k].includes(value)?p[k].filter(v=>v!==value):[...p[k],value]}));
 const scale=<div className="program-time-scale"><div className="program-months">{months.map((m,i)=><span key={i} style={{left:`${m.left}%`,width:`${m.width}%`}}>{m.name}</span>)}</div><div className="program-weeks">{weeks.map(ms=><span key={ms} style={{left:`${(ms-left)/duration*100}%`}}>{new Date(ms).toLocaleDateString('pt-BR',{day:'2-digit'})}</span>)}</div></div>;
 const gridStyle={backgroundImage:`linear-gradient(to right,#dce5ef 1px,transparent 1px)`,backgroundSize:`${7*DAY/duration*100}% 100%`};
 return <>
  <div className="diagnostic-search-row"><input aria-label="Pesquisar por endereço" placeholder="Pesquisar por endereço..." value={search} onChange={e=>onSearch(e.target.value)}/><button className="diagnostic-filter-toggle" aria-expanded={open} onClick={()=>{if(!open)setDraft({...applied,city:[...applied.city],status:[...applied.status],priority:[...applied.priority]});setOpen(!open);setField(null)}}>Filtros {open?'▴':'▾'}</button></div>
  {open&&<div className="program-filters"><div className="program-filter-fields">{(['city','status','priority'] as FilterKey[]).map(k=><div className="program-filter" key={k}><label>{k==='city'?'Município':k==='status'?'Status':'Prioridade'}</label><button type="button" className="program-filter-trigger" aria-expanded={field===k} onClick={()=>{setField(field===k?null:k);setOptionSearch('')}}><span>{draft[k].length?`${draft[k].length} selecionado(s)`:'Todos'}</span><span>{field===k?'▴':'▾'}</span></button>{field===k&&<div className="program-filter-options"><input aria-label={`Pesquisar ${k}`} placeholder="Pesquisar opções..." value={optionSearch} onChange={e=>setOptionSearch(e.target.value)}/>{options[k].filter(v=>v.toLocaleLowerCase().includes(optionSearch.toLocaleLowerCase())).map(v=><label className="program-checkrow" key={v}><input type="checkbox" checked={draft[k].includes(v)} onChange={()=>toggle(k,v)}/><span>{v}</span></label>)}</div>}</div>)}</div><div className="program-filter-actions"><button type="button" onClick={()=>{setDraft(empty());setApplied(empty());onApply(empty());setField(null);setOptionSearch('')}}>Limpar filtros</button><button type="button" className="primary" onClick={()=>{setApplied(draft);onApply(draft);setOpen(false);setField(null)}}>Aplicar</button></div></div>}
  <div className="program-gantt"><div className="program-gantt-header program-gantt-row"><span>Endereço</span><span>Prioridade</span><span>Status</span><span>% Exec.</span>{scale}</div>{grouped.map(g=><div key={g.city}><div className="program-city">{g.city} ({g.rows.length})</div>{g.rows.map(item=>{const p=Math.min(100,Math.max(0,executionPercent(item as unknown as Work)));const x=(parse(item.plannedStart)-left)/duration*100;const w=(parse(item.plannedEnd)-parse(item.plannedStart)+DAY)/duration*100;return <div className="program-gantt-row program-data-row" key={item.id}><div><button className="program-address" title={item.address} onClick={()=>onOpen(item.id)}>{item.address}</button></div><span>{item.priority}</span><span><span className={`program-status pill ${statusColor(item.status,item.plannedEnd)}`}>{item.status}</span></span><span>{p.toLocaleString('pt-BR',{maximumFractionDigits:1})}%</span><div className="program-chart" style={gridStyle}><button className="program-bar" style={{left:`${x}%`,width:`${Math.max(0.5,w)}%`}} title={`Início: ${dateText(item.plannedStart)} · Término: ${dateText(item.plannedEnd)} · Clique para editar`} onClick={()=>onEdit(item)} aria-label={`Editar programação de ${item.address}`}/></div></div>})}</div>)}{!dated.length&&<p className="program-empty">Não há registros com ambas as datas previstas no filtro atual.</p>}</div>
 </>;
}
