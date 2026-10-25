/** PDF reports isolated from screens and persistence. */
import type { Work } from '../model';
import { jsPDF } from 'jspdf';
import { drawWorkMap } from './pdfWorkMap';
import { drawWorkGantt } from './pdfWorkGantt';

type Data = Record<string, unknown>;
type Kind = 'Obra' | 'Diagnóstico' | 'Topografia';
type Opts = { population?: number; linkedWorks?: Work[]; linkedTopographies?: Data[] };
const val = (v: unknown) => v === undefined || v === null || v === '' ? '—' : String(v);
const date = (v: unknown) => { if (!v) return '—'; const s = String(v); const d = /^\d{4}-\d{2}-\d{2}/.exec(s); return d ? `${s.slice(8,10)}/${s.slice(5,7)}/${s.slice(0,4)}` : s; };
const num = (v: unknown) => Number(v) || 0;
const fmt = (v: number, digits=2) => v.toLocaleString('pt-BR', {minimumFractionDigits:digits, maximumFractionDigits:digits});
const money = (v: number) => 'R$ ' + fmt(v);
const list = (v: unknown): Data[] => Array.isArray(v) ? v.filter((x): x is Data => !!x && typeof x === 'object' && !Array.isArray(x)) : [];
const shortId = (v: unknown) => String(v || '—').slice(0,8).toUpperCase();

export async function generateTechnicalPdf(kind: Kind, record: Data, opts: Opts = {}) {
  const doc = new jsPDF({unit:'mm', format:'a4', compress:true});
  const L=15, R=195, TOP=30, BOTTOM=267, W=180;
  let y=TOP;
  const emitted = new Date().toLocaleString('pt-BR');
  const next = (landscape=false) => {doc.addPage('a4', landscape ? 'landscape':'portrait'); y=TOP;};
  const ensure = (h:number) => {if(y+h>BOTTOM) next();};
  const title = (name:string, minAfter=7) => {
    if(y>TOP) y+=10;
    ensure(13+minAfter);
    doc.setFillColor(10,55,99);doc.roundedRect(L,y,W,9,1.2,1.2,'F');
    doc.setTextColor(255,255,255);doc.setFont('helvetica','bold');doc.setFontSize(10.5);
    doc.text(name.toUpperCase(),L+3,y+6);y+=13;
  };
  const field = (key:string, value:unknown) => {
    const txt=val(value);
    doc.setFontSize(9);
    const valueLines=doc.splitTextToSize(txt, 112) as string[];
    const labelLines=doc.splitTextToSize(key,60) as string[];
    const rows=Math.max(labelLines.length,valueLines.length,1);
    let pos=0;
    while(pos<rows){
      ensure(7);const available=Math.max(1,Math.floor((BOTTOM-y-2)/4.4));const count=Math.min(rows-pos,available);
      const height=Math.max(7,count*4.4+2);
      doc.setFont('helvetica','bold');doc.setTextColor(52,66,82);
      doc.text(labelLines.slice(pos,pos+count),L+2,y+4,{lineHeightFactor:1.38});
      doc.setFont('helvetica','normal');doc.setTextColor(34,45,57);
      doc.text(valueLines.slice(pos,pos+count),L+66,y+4,{lineHeightFactor:1.38});
      doc.setDrawColor(230,235,240);doc.line(L,y+height-1,R,y+height-1);
      y+=height;pos+=count;
    }
  };
  // Keeps title, column headings and first data row together. Repeats column headings on overflow.
  const table = (heading:string, headers:string[], rows:unknown[][], widths:number[]) => {
    const pad=2, font=8, lh=3.8;
    const wrap = (values:unknown[]) => values.map((v,i)=>doc.splitTextToSize(val(v),widths[i]-pad*2) as string[]);
    const headerLines=wrap(headers);
    const headerH=Math.max(8,...headerLines.map(a=>a.length*lh+4));
    const renderHead=()=>{
      doc.setFillColor(231,240,247);doc.rect(L,y,W,headerH,'F');doc.setTextColor(22,76,120);
      doc.setFont('helvetica','bold');doc.setFontSize(font);
      let x=L;headerLines.forEach((lines,i)=>{doc.text(lines,x+pad,y+(headerH-lines.length*lh)/2+lh-0.5,{lineHeightFactor:1.3});x+=widths[i];});
      y+=headerH;
    };
    const first = rows.length ? Math.max(7,...wrap(rows[0]).map(a=>a.length*lh+4)) : 8;
    ensure(13+headerH+first);title(heading,headerH+first);
    renderHead();
    if(!rows.length){doc.setFont('helvetica','normal');doc.setTextColor(90,100,110);doc.text('Nenhum registro',L+2,y+5);y+=9;return;}
    for(const row of rows){
      const cells=wrap(row);
      const rowH=Math.max(7,...cells.map(a=>a.length*lh+4));
      if(y+rowH>BOTTOM){next();renderHead();}
      // Center text vertically; wrap text and adapt each row's height.
      doc.setFont('helvetica','normal');doc.setFontSize(font);doc.setTextColor(34,45,57);
      let x=L;cells.forEach((lines,i)=>{
        const contentH=lines.length*lh;
        doc.text(lines,x+pad,y+(rowH-contentH)/2+lh-0.5,{lineHeightFactor:1.3});x+=widths[i];
      });
      doc.setDrawColor(226,233,238);doc.line(L,y+rowH,R,y+rowH);y+=rowH;
    }
    y+=3;
  };
  if(kind==='Obra'){
    title('Dados da obra');
    const address=[val(record.address),record.number ? String(record.number):'',val(record.district)].filter(s=>s!=='—'&&s).join(', ');
    const fullAddress=`${address} - ${val(record.city)}/SP`;
    const fields: [string,unknown][]=[['Identificador',shortId(record.id)],['Data de cadastro',date(record.createdAt)],['Endereço',fullAddress],['Objetivo',record.goal],['Solicitante',record.requester],['Documento da solicitação',record.requestDocument],['Tipo de obra',record.kind],['Água/Esgoto',record.ae],['Serviço',record.service],['Método executivo',record.method],['Ligações (LIG)',record.links],['PNG',record.png],['Booster',record.booster],['VRP',record.vrp],['Prioridade',record.priority],['População atendida (habitantes)',opts.population ?? num(record.links)*4],['Observações',record.notes]];
    const halfW=88,gap=4;
    for(let i=0;i<fields.length;i+=2){
      const cells=fields.slice(i,i+2).map(([key,value])=>({key,lines:doc.splitTextToSize(val(value),halfW-5) as string[]}));
      const height=Math.max(...cells.map(c=>5+c.lines.length*3.1),9);
      ensure(height+1);
      cells.forEach((c,j)=>{const x=L+j*(halfW+gap);doc.setFont('helvetica','normal');doc.setFontSize(8);doc.setTextColor(52,66,82);doc.text(c.key,x+2,y+3);doc.setFont('helvetica','bold');doc.setTextColor(34,45,57);doc.text(c.lines,x+2,y+6.4,{lineHeightFactor:1.1});});
      doc.setDrawColor(220,228,235);doc.setLineWidth(.15);doc.line(L,y+height,R,y+height);
      y+=height;
    }
  } else {
    title(kind==='Diagnóstico'?'Dados do diagnóstico':'Dados da topografia');
    const ignore=new Set(['points','lines','segments','reports','photos','id','originDiagnosticId','originTopographyId']);
    field('Identificador',shortId(record.id));
    Object.entries(record).filter(([k,v])=>!ignore.has(k)&&!Array.isArray(v)&&!(v&&typeof v==='object')).forEach(([k,v])=>field(({createdAt:'Data de cadastro',address:'Endereço',district:'Bairro',city:'Município',goal:'Objetivo',requester:'Solicitante',requestDocument:'Documento da solicitação',notes:'Observações',status:'Status',statusAt:'Data Status'} as Record<string,string>)[k]||k,v));
  }
  const segments=list(record.segments), points=list(record.points);
  if(kind==='Obra'){
    // Reserve the first page for work details and the map. Map height is capped by
    // available space, and the next page is exclusively the landscape Gantt.
    const mapTitleSpace=23;
    const available=Math.max(0,BOTTOM-y-mapTitleSpace);
    if(available>=28){
      title('Croqui da obra',available);
      const mapH=Math.max(25,Math.min(91,BOTTOM-y-3));
      await drawWorkMap(doc,record,L,y,W,mapH);y+=mapH+3;
    } else {
      // Extreme amounts of work metadata cannot physically fit with a legible map.
      // Preserve the document margins rather than overlap its footer.
      next();title('Croqui da obra',91);
      await drawWorkMap(doc,record,L,y,W,91);y+=94;
    }
    next(true);
    drawWorkGantt(doc,record as unknown as Work);
    next();
  } else {
    title(`Croqui ${kind==='Diagnóstico'?'do diagnóstico':'da topografia'}`,82);
    if(points.length&&segments.length){
      ensure(83);await drawWorkMap(doc,record,L,y,W,69);y+=74;
    }else field('Croqui','Sem trechos cadastrados');
  }
  table('Trechos do croqui',['Trecho','Endereço','Ext. (m)','Status','Data Status'],segments.map(s=>[s.name,s.address,fmt(num(s.manual??s.calculated),1),s.status,date(s.statusAt)]),[36,60,23,34,27]);
  if(kind==='Obra'){
    table('Pavimentos',['Tipo de pavimento','Extensão (m)'],list(record.pavements).map(p=>[p.type,fmt(num(p.length),1)]),[110,70]);
    const budget=list(record.budget),budgetRows=budget.map(b=>[b.description,b.unit,fmt(num(b.quantity),2),money(num(b.unitPrice)),money(num(b.quantity)*num(b.unitPrice))]);
    table('Orçamento',['Descrição','Und.','Qtde.','Preço Unit.','Total'],budgetRows,[72,16,20,34,38]);
    ensure(12);doc.setFont('helvetica','bold');doc.setFontSize(11);doc.setTextColor(22,76,120);doc.text(`TOTAL DO ORÇAMENTO: ${money(budget.reduce((s,b)=>s+num(b.quantity)*num(b.unitPrice),0))}`,R,y+5,{align:'right'});y+=13;
    table('Etapas da obra',['Etapa','Status','Data Status','Previsão de conclusão','Observação'],list(record.stages).map(s=>[s.name,s.status,date(s.statusAt),date(s.end),s.note]),[42,29,29,29,51]);
    const docs=(key:string,name:string)=>table(name,['Documento','Status','Data Status','Previsão de entrega','Observação'],list(record[key]).map(s=>[s.name,s.status,date(s.statusAt),date(s.end),s.note]),[42,29,29,29,51]);
    docs('startDocs','Checklist de início de obra');docs('endDocs','Checklist de conclusão de obra');
  }else{
    table('Obras geradas',['Identificador','Endereço','Município'],(opts.linkedWorks||[]).map(w=>[shortId(w.id),w.address,w.city]),[30,105,45]);
    if(kind==='Diagnóstico')table('Topografias geradas',['Identificador','Endereço','Município'],(opts.linkedTopographies||[]).map(t=>[shortId(t.id),t.address,t.city]),[30,105,45]);
  }
  const count=doc.getNumberOfPages();
  for(let i=1;i<=count;i++){
    doc.setPage(i);const width=doc.internal.pageSize.getWidth(),height=doc.internal.pageSize.getHeight();const right=width-15;
    doc.setDrawColor(210,222,232);doc.setLineWidth(.3);doc.line(15,22,right,22);doc.line(15,height-21,right,height-21);
    if(kind==='Obra'){
      const location=[record.address,record.district,record.city].filter(v=>v!==null&&v!==undefined&&String(v).trim()).map(v=>String(v)).join(' - ').toUpperCase();
      const totalLength=segments.reduce((sum,s)=>sum+num(s.manual??s.calculated),0);
      const service=[record.service,record.ae,`${fmt(totalLength,0)} m`].filter(v=>v!==null&&v!==undefined&&String(v).trim()).map(String).join(' - ').toUpperCase();
      const leftWidth=(width-30)*0.57, rightWidth=width-30-leftWidth-3;
      doc.setTextColor(22,76,120);doc.setFont('helvetica','normal');doc.setFontSize(8);doc.text('RESUMO DE OBRA',15,10);
      doc.setFont('helvetica','bold');doc.setFontSize(9);
      const leftLines=doc.splitTextToSize(location||'—',leftWidth) as string[];
      doc.text(leftLines.slice(0,2),15,15,{lineHeightFactor:1.1});
      doc.setFont('helvetica','normal');doc.setFontSize(8);doc.text('SERVIÇO - A/E - EXT.',right,10,{align:'right'});
      doc.setFont('helvetica','bold');doc.setFontSize(9);
      const rightLines=doc.splitTextToSize(service||'—',rightWidth) as string[];
      doc.text(rightLines.slice(0,2),right,15,{align:'right',lineHeightFactor:1.1});
    }else{
      doc.setTextColor(22,76,120);doc.setFont('helvetica','bold');doc.setFontSize(9);doc.text('SISTEMA DE GESTÃO DE OBRAS',15,14);
      doc.setFont('helvetica','normal');doc.setFontSize(8);doc.setTextColor(89,103,117);
      doc.text(`RELATÓRIO DE ${kind.toUpperCase()}  |  ${shortId(record.id)}`,right,19,{align:'right'});
    }
    doc.text(`Emitido em: ${emitted}`,15,height-14);doc.text(`Página ${i} de ${count}`,right,height-14,{align:'right'});
  }
  const safeFilePart=(v:unknown)=>String(v??'').trim().replace(/[\\/:*?"<>|]/g,'-').replace(/\s+/g,' ').replace(/[. ]+$/g,'').slice(0,100);
  const filename=kind==='Obra'?[record.ae,record.address,record.district,record.city].map(safeFilePart).filter(Boolean).join(' - ')+'.pdf':`Relatorio_${kind}_${shortId(record.id)}.pdf`;
  doc.save(filename);
}
