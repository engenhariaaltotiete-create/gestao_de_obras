/** Independent PDF rendering of the individual work schedule. */
import type { jsPDF } from 'jspdf';
import { budgetTotal, executionPercent, executionStatus, type Work } from '../model';
const DAY=86400000;
const stamp=(s:string)=>Date.parse(s.slice(0,10)+'T12:00:00Z');
const valid=(s:string)=>Number.isFinite(stamp(s));
const months=['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
export function drawWorkGantt(doc:jsPDF,work:Work, startPage:()=>void){
 const rows=work.stages.filter(s=>!['CANCELADO','NÃO SE APLICA'].includes(s.status.toUpperCase()));
 const dates=rows.flatMap(r=>[r.start,r.end]).filter(valid).map(stamp);
 const now=stamp(new Date().toISOString());
 const min=dates.length?Math.min(...dates):now,max=dates.length?Math.max(...dates):now;
 const total=Math.max(93,Math.ceil((max-min)/DAY)+29);
 const first=min-Math.floor((total-Math.ceil((max-min)/DAY))/2)*DAY;
 const last=first+total*DAY;
 const L=15,R=282,top=30,base=180;
 const cols=[65,143,26,33],xs=[L,L+65,L+208,L+234,R];
 const head=()=>{
  doc.setFillColor(10,55,99);doc.rect(L,top,R-L,22,'F');doc.setTextColor(255,255,255);
  doc.setFont('helvetica','bold');doc.setFontSize(11);doc.text('CRONOGRAMA DA OBRA',L+4,top+8);
  doc.setFont('helvetica','normal');doc.setFontSize(6.4);doc.text('Planejamento e acompanhamento das etapas e documentos da obra',L+4,top+13);
  const cards:[string,string][]=[['STATUS DA EXECUÇÃO',executionStatus(work)],['% EXECUTADO',executionPercent(work).toFixed(1)+'%'],['ORÇAMENTO TOTAL',budgetTotal(work).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})]];
  let x=123;for(const [name,value] of cards){const w=name==='ORÇAMENTO TOTAL'?58:47;doc.setFillColor(255,255,255);doc.roundedRect(x,top+3,w,16,1.2,1.2,'F');doc.setTextColor(50,79,110);doc.setFontSize(6.2);doc.setFont('helvetica','bold');doc.text(name,x+3,top+7.5);doc.setTextColor(10,55,99);doc.setFontSize(9);doc.text(value,x+3,top+14);x+=w+3;}
  let y=top+27;doc.setFillColor(232,241,249);doc.rect(L,y,R-L,16,'F');doc.setTextColor(10,55,99);doc.setFont('helvetica','bold');doc.setFontSize(8);
  doc.text('ETAPAS',L+2,y+11);doc.text('STATUS',xs[2]+2,y+11);doc.text('OBSERVAÇÃO',xs[3]+2,y+11);
  const chartL=xs[1],chartW=cols[1], pos=(t:number)=>chartL+(t-first)/(last-first)*chartW;
  const monthStart=new Date(first);monthStart.setUTCDate(1);
  for(let t=monthStart.getTime();t<last;){const d=new Date(t),n=new Date(t);n.setUTCMonth(n.getUTCMonth()+1);const e=n.getTime();const x=Math.max(chartL,pos(t)),x2=Math.min(chartL+chartW,pos(e));if(x2>x+5)doc.text(`${months[d.getUTCMonth()]}/${String(d.getUTCFullYear()).slice(2)}`,(x+x2)/2,y+6,{align:'center'});t=e;}
  for(let t=first;t<=last;t+=DAY){const d=new Date(t);if(d.getUTCDay()!==1)continue;const x=pos(t);doc.setDrawColor(175,193,208);doc.line(x,y+8,x,base);doc.setFont('helvetica','normal');doc.setFontSize(6.3);doc.text(String(d.getUTCDate()).padStart(2,'0'),x+1,y+13);}
  if(now>=first&&now<=last){const x=pos(now);doc.setDrawColor(211,64,57);doc.setLineWidth(.45);doc.setLineDashPattern([1.3,1.2],0);doc.line(x,y+15,x,base);doc.setLineDashPattern([],0);doc.setLineWidth(.2);}
  return {y:y+16,pos,chartL,chartW};
 };
 let {y,pos,chartL,chartW}=head();
 const drawRow=(row:{name:string;start:string;end:string;status:string;note?:string},idx:number)=>{
  if(y+12>base){startPage();({y,pos,chartL,chartW}=head());}
  const note=doc.splitTextToSize(row.note||'—',cols[3]-4) as string[];
  const name=doc.splitTextToSize(row.name||'—',cols[0]-4) as string[];
  const status=doc.splitTextToSize(row.status||'—',cols[2]-4) as string[];
  const h=Math.max(9,Math.max(note.length,name.length,status.length)*3.2+3);
  if(y+h>base){startPage();({y,pos,chartL,chartW}=head());}
  if(idx%2===0){doc.setFillColor(247,249,251);doc.rect(L,y,R-L,h,'F');}
  doc.setFont('helvetica','normal');doc.setFontSize(7);doc.setTextColor(38,52,65);
  doc.text(name,L+2,y+4,{lineHeightFactor:1.2});doc.text(status,xs[2]+2,y+4,{lineHeightFactor:1.2});doc.text(note,xs[3]+2,y+4,{lineHeightFactor:1.2});
  if(valid(row.start)&&valid(row.end)){
   const a=stamp(row.start),b=stamp(row.end);const x=Math.max(chartL,pos(Math.min(a,b))),right=Math.min(chartL+chartW,pos(Math.max(a,b)+DAY));
   if(right>x){doc.setFillColor(row.name==='Execução de Obra'?26:44,row.name==='Execução de Obra'?139:106,row.name==='Execução de Obra'?88:166);doc.roundedRect(x,y+h/2-2,Math.max(1,right-x),4,1,1,'F');}
  }
  doc.setDrawColor(221,230,238);doc.line(L,y+h,R,y+h);y+=h;
 };
 rows.forEach((r,i)=>drawRow(r,i));
 if(!rows.length){doc.setTextColor(100,110,120);doc.text('Nenhuma etapa cadastrada.',L+2,y+6);}
}
