/** Compact, single-page landscape Gantt for the work PDF. */
import type { jsPDF } from 'jspdf';
import { budgetTotal, executionPercent, executionStatus, type Work, type Item } from '../model';
const DAY=86400000;
const stamp=(value:string|undefined)=>value && /^\d{4}-\d{2}-\d{2}/.test(value)?Date.parse(value.slice(0,10)+'T12:00:00Z'):NaN;
const months=['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
type Row={name:string;start?:string;end?:string;status:string;note:string};
export function drawWorkGantt(doc:jsPDF,work:Work){
 const stageRows:Row[]=work.stages.filter(s=>!['CANCELADO','NÃO SE APLICA'].includes((s.status||'').toUpperCase())).map(s=>({name:s.name,start:s.start,end:s.end,status:s.status,note:s.note||''}));
 const summary=(items:Item[],name:string):Row=>{
  const times=items.flatMap(i=>[stamp(i.start),stamp(i.end)]).filter(Number.isFinite);
  const completed=items.filter(i=>(i.status||'').toUpperCase()==='CONCLUÍDO').length;
  return {name,start:times.length?new Date(Math.min(...times)).toISOString().slice(0,10):undefined,end:times.length?new Date(Math.max(...times)).toISOString().slice(0,10):undefined,status:items.length?`${completed}/${items.length} concluídos`:'Sem itens',note:''};
 };
 const rows=[...stageRows,summary(work.startDocs,'Checklist de Início'),summary(work.endDocs,'Checklist de Conclusão')];
 const dates=rows.flatMap(r=>[stamp(r.start),stamp(r.end)]).filter(Number.isFinite);
 const today=stamp(new Date().toISOString());
 const min=dates.length?Math.min(...dates):today,max=dates.length?Math.max(...dates):today;
 // At least one calendar month, with a minimum of seven days either side of the work dates.
 let first=min-7*DAY,last=max+8*DAY;
 const minEnd=new Date(first);minEnd.setUTCMonth(minEnd.getUTCMonth()+1);
 if(last<minEnd.getTime())last=minEnd.getTime();
 const L=29.5,cols=[40,100,30,68],R=L+238,xs=[L,L+40,L+140,L+170,R];
 const top=30,footerLimit=180;
 const cardY=top+2;
 doc.setFillColor(10,55,99);doc.rect(L,top,238,22,'F');
 doc.setFont('helvetica','bold');doc.setFontSize(10);doc.setTextColor(255,255,255);doc.text('CRONOGRAMA DA OBRA',L+3,top+8);
 doc.setFont('helvetica','normal');doc.setFontSize(6);doc.text('Planejamento e acompanhamento das etapas e documentos da obra',L+3,top+13);
 const cards:[string,string,number][]=[['STATUS DA EXECUÇÃO',executionStatus(work),43],['% EXECUTADO',`${executionPercent(work).toFixed(1)}%`,36],['ORÇAMENTO TOTAL',budgetTotal(work).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}),50]];
 let cardX=R-135;for(const [label,value,w] of cards){doc.setFillColor(255,255,255);doc.roundedRect(cardX,cardY,w,16,1,1,'F');doc.setFont('helvetica','bold');doc.setTextColor(65,85,105);doc.setFontSize(5.6);doc.text(label,cardX+2,cardY+5);doc.setTextColor(10,55,99);doc.setFontSize(8);const clipped=doc.splitTextToSize(value,w-4) as string[];doc.text(clipped[0]||'',cardX+2,cardY+12);cardX+=w+3;}
 const headY=top+26,headH=14,bodyY=headY+headH;
 doc.setFillColor(230,240,248);doc.rect(L,headY,238,headH,'F');
 doc.setFont('helvetica','bold');doc.setFontSize(7);doc.setTextColor(10,55,99);
 doc.text('ETAPAS',xs[0]+2,headY+9);doc.text('STATUS',xs[2]+2,headY+9);doc.text('OBSERVAÇÃO',xs[3]+2,headY+9);
 const pos=(t:number)=>xs[1]+(t-first)/(last-first)*cols[1];
 for(let t=Date.UTC(new Date(first).getUTCFullYear(),new Date(first).getUTCMonth(),1,12);t<last;){const d=new Date(t),n=new Date(t);n.setUTCMonth(n.getUTCMonth()+1);const right=n.getTime();const a=Math.max(xs[1],pos(t)),b=Math.min(xs[2],pos(right));if(b-a>12)doc.text(`${months[d.getUTCMonth()]}/${String(d.getUTCFullYear()).slice(-2)}`,(a+b)/2,headY+5,{align:'center'});t=right;}
 const weeks:number[]=[];
 for(let t=first;t<=last;t+=DAY){if(new Date(t).getUTCDay()===1)weeks.push(t);}
 for(const t of weeks){const x=pos(t);if(x<xs[1]||x>xs[2])continue;doc.setFont('helvetica','normal');doc.setFontSize(6);doc.setTextColor(35,75,105);doc.text(String(new Date(t).getUTCDate()).padStart(2,'0'),Math.min(x+1,xs[2]-5),headY+11);}
 // Fit every row on this single page, including long notes; no overflow page is created.
 const usable=footerLimit-bodyY-2;
 const rowH=Math.min(9.2,usable/Math.max(1,rows.length));
 const font=Math.max(4.5,Math.min(7,rowH*0.82));
 const lineH=font*0.40;
 const cell=(value:string,x:number,width:number,y:number)=>{
  doc.setFont('helvetica','normal');doc.setFontSize(font);
  const lines=doc.splitTextToSize(value||'—',width-4) as string[];
  const maxLines=Math.max(1,Math.floor((rowH-1)/lineH));
  const visible=lines.slice(0,maxLines);
  if(lines.length>maxLines){const lastLine=visible.length-1;visible[lastLine]=visible[lastLine].slice(0,-2)+'…';}
  const blockH=visible.length*lineH;
  doc.setTextColor(38,52,65);doc.text(visible,x+2,y+(rowH-blockH)/2+lineH*.82,{lineHeightFactor:1.15});
 };
 rows.forEach((r,i)=>{
  const y=bodyY+i*rowH;
  if(i%2===0){doc.setFillColor(247,249,251);doc.rect(L,y,238,rowH,'F');}
  cell(r.name,xs[0],cols[0],y);cell(r.status,xs[2],cols[2],y);cell(r.note||'—',xs[3],cols[3],y);
  const a=stamp(r.start),b=stamp(r.end);
  if(Number.isFinite(a)&&Number.isFinite(b)){
   const x=Math.max(xs[1],pos(Math.min(a,b))),right=Math.min(xs[2],pos(Math.max(a,b)+DAY));
   if(right>x){doc.setFillColor(44,106,166);doc.roundedRect(x,y+rowH/2-1.4,right-x,2.8,.7,.7,'F');}
  }
  doc.setDrawColor(224,232,239);doc.setLineWidth(.13);doc.line(L,y+rowH,R,y+rowH);
 });
 const endY=bodyY+rows.length*rowH;
 // Week separators above bars but behind the Today marker.
 doc.setDrawColor(190,202,214);doc.setLineWidth(.12);
 for(const t of weeks){const x=pos(t);if(x>=xs[1]&&x<=xs[2])doc.line(x,bodyY,x,endY);}
 // Draw Today LAST so it stays in front of every Gantt element.
 if(today>=first&&today<=last){const x=pos(today);doc.setDrawColor(210,48,44);doc.setLineWidth(.55);doc.setLineDashPattern([1.3,1],0);doc.line(x,headY+headH,x,endY);doc.setLineDashPattern([],0);doc.setLineWidth(.2);}
 doc.setDrawColor(198,212,225);for(const x of xs)doc.line(x,headY,x,endY);
}
