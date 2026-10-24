/** PDF reports isolated from screens and persistence. */
import type { Work } from '../model';
import { jsPDF } from 'jspdf';

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
    ensure(13+minAfter);
    doc.setFillColor(238,244,249);doc.roundedRect(L,y,W,9,1.2,1.2,'F');
    doc.setTextColor(22,76,120);doc.setFont('helvetica','bold');doc.setFontSize(10.5);
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
      let x=L;headerLines.forEach((lines,i)=>{doc.text(lines,x+pad,y+4,{lineHeightFactor:1.3});x+=widths[i];});
      y+=headerH;
    };
    const first = rows.length ? Math.max(7,...wrap(rows[0]).map(a=>a.length*lh+4)) : 8;
    ensure(13+headerH+Math.min(first,15));title(heading,headerH+Math.min(first,15));
    renderHead();
    if(!rows.length){doc.setFont('helvetica','normal');doc.setTextColor(90,100,110);doc.text('Nenhum registro',L+2,y+5);y+=9;return;}
    for(const row of rows){
      const cells=wrap(row);
      // Very long cell is continued, never clipped, and column headings are repeated.
      let offset=0;const maxLines=Math.max(...cells.map(a=>a.length));
      while(offset<maxLines){
        if(y+7>BOTTOM){next();renderHead();}
        const available=Math.max(1,Math.floor((BOTTOM-y-4)/lh));
        const count=Math.min(maxLines-offset,available);
        const partH=Math.max(7,count*lh+4);
        doc.setFont('helvetica','normal');doc.setFontSize(font);doc.setTextColor(34,45,57);
        let x=L;cells.forEach((lines,i)=>{const part=lines.slice(offset,offset+count);if(part.length)doc.text(part,x+pad,y+4,{lineHeightFactor:1.3});x+=widths[i];});
        doc.setDrawColor(226,233,238);doc.line(L,y+partH,R,y+partH);
        y+=partH;offset+=count;
        if(offset<maxLines){next();renderHead();}
      }
    }
    y+=3;
  };
  title(`Relatório de ${kind}`);
  if(kind==='Obra'){
    title('Dados da obra');
    const address=[val(record.address),record.number ? String(record.number):'',val(record.district)].filter(s=>s!=='—'&&s).join(', ');
    const fullAddress=`${address} - ${val(record.city)}/SP`;
    ([['Identificador',shortId(record.id)],['Data de cadastro',date(record.createdAt)],['Endereço',fullAddress],['Objetivo',record.goal],['Solicitante',record.requester],['Documento da solicitação',record.requestDocument],['Tipo de obra',record.kind],['Água/Esgoto',record.ae],['Serviço',record.service],['Método executivo',record.method],['Ligações (LIG)',record.links],['PNG',record.png],['Booster',record.booster],['VRP',record.vrp],['Prioridade',record.priority],['População atendida (habitantes)',opts.population ?? num(record.links)*4],['Observações',record.notes]] as [string,unknown][]).forEach(([k,v])=>field(k,v));
  } else {
    title(kind==='Diagnóstico'?'Dados do diagnóstico':'Dados da topografia');
    const ignore=new Set(['points','lines','segments','reports','photos','id','originDiagnosticId','originTopographyId']);
    field('Identificador',shortId(record.id));
    Object.entries(record).filter(([k,v])=>!ignore.has(k)&&!Array.isArray(v)&&!(v&&typeof v==='object')).forEach(([k,v])=>field(({createdAt:'Data de cadastro',address:'Endereço',district:'Bairro',city:'Município',goal:'Objetivo',requester:'Solicitante',requestDocument:'Documento da solicitação',notes:'Observações',status:'Status',statusAt:'Data Status'} as Record<string,string>)[k]||k,v));
  }
  const segments=list(record.segments), points=list(record.points);
  title(kind==='Obra'?'Croqui da obra':`Croqui ${kind==='Diagnóstico'?'do diagnóstico':'da topografia'}`,82);
  if(points.length&&segments.length){
    ensure(83);
    const mapY=y, H=69;
    doc.setFillColor(244,248,250);doc.roundedRect(L,mapY,W,H,1.5,1.5,'F');
    const valid=points.filter(p=>Number.isFinite(Number(p.lat))&&Number.isFinite(Number(p.lng)));
    if(valid.length){
      const lats=valid.map(p=>Number(p.lat)), lngs=valid.map(p=>Number(p.lng));
      const minLat=Math.min(...lats),minLng=Math.min(...lngs),latSpan=Math.max(1e-6,Math.max(...lats)-minLat),lngSpan=Math.max(1e-6,Math.max(...lngs)-minLng);
      const scale=Math.min(156/lngSpan,49/latSpan),xo=(W-lngSpan*scale)/2,yo=(H-latSpan*scale)/2;
      const pos=(p:Data):[number,number]=>[L+xo+(Number(p.lng)-minLng)*scale,mapY+H-yo-(Number(p.lat)-minLat)*scale];
      const lookup=new Map(valid.map(p=>[String(p.id),p]));
      for(const s of segments){const a=lookup.get(String(s.from)),b=lookup.get(String(s.to));if(!a||!b)continue;
        const [ax,ay]=pos(a),[bx,by]=pos(b);const done=String(s.status).toUpperCase()==='CONCLUÍDO';
        doc.setDrawColor(done?34:31,done?151:105,done?84:170);doc.setLineWidth(0.85);doc.line(ax,ay,bx,by);
        const label=`${val(s.name)} · ${fmt(s.manual===null||s.manual===undefined?num(s.calculated):num(s.manual),1)} m`;
        const mx=(ax+bx)/2,my=(ay+by)/2;doc.setFontSize(7);doc.setFont('helvetica','bold');
        const clipped=label.slice(0,46),width=Math.min(77,doc.getTextWidth(clipped)+4);
        doc.setFillColor(255,255,255);doc.roundedRect(mx-width/2,my-5,width,7,1,1,'F');doc.setTextColor(20,32,44);doc.text(clipped,mx,my-0.3,{align:'center'});
      }
      const total=segments.reduce((s,t)=>s+num(t.manual??t.calculated),0),done=segments.filter(s=>String(s.status).toUpperCase()==='CONCLUÍDO').reduce((sum,t)=>sum+num(t.manual??t.calculated),0);
      doc.setFillColor(255,255,255);doc.roundedRect(L+W-62,mapY+3,59,17,1,1,'F');doc.setFontSize(7.5);doc.setFont('helvetica','bold');
      doc.setTextColor(30,30,30);doc.text(`Total: ${fmt(total,1)} m`,L+W-59,mapY+8);
      doc.setTextColor(29,135,73);doc.text(`Executada: ${fmt(done,1)} m`,L+W-59,mapY+13);
      doc.setTextColor(34,100,175);doc.text(`A executar: ${fmt(total-done,1)} m`,L+W-30,mapY+13);
    }
    y=mapY+H+5;
  }else field('Croqui','Sem trechos cadastrados');
  table('Trechos do croqui',['Trecho','Endereço','Ext. (m)','Status','Data Status'],segments.map(s=>[s.name,s.address,fmt(num(s.manual??s.calculated),1),s.status,date(s.statusAt)]),[36,60,23,34,27]);
  if(kind==='Obra'){
    table('Pavimentos',['Tipo de pavimento','Extensão (m)'],list(record.pavements).map(p=>[p.type,fmt(num(p.length),1)]),[110,70]);
    const budget=list(record.budget),budgetRows=budget.map(b=>[b.description,b.unit,fmt(num(b.quantity),2),money(num(b.unitPrice)),money(num(b.quantity)*num(b.unitPrice))]);
    table('Orçamento',['Descrição','Und.','Qtde.','Preço Unit.','Total'],budgetRows,[72,16,20,34,38]);
    ensure(12);doc.setFont('helvetica','bold');doc.setFontSize(11);doc.setTextColor(22,76,120);doc.text(`TOTAL DO ORÇAMENTO: ${money(budget.reduce((s,b)=>s+num(b.quantity)*num(b.unitPrice),0))}`,R,y+5,{align:'right'});y+=13;
    table('Etapas da obra',['Etapa','Status','Data Status','Previsão de conclusão','Observação'],list(record.stages).map(s=>[s.name,s.status,date(s.statusAt),date(s.end),s.note]),[42,29,29,35,45]);
    const docs=(key:string,name:string)=>table(name,['Documento','Status','Data Status','Previsão de entrega','Observação'],list(record[key]).map(s=>[s.name,s.status,date(s.statusAt),date(s.end),s.note]),[42,29,29,35,45]);
    docs('startDocs','Checklist de início de obra');docs('endDocs','Checklist de conclusão de obra');
    // Dedicated landscape page: 3 cm top/bottom and 1.5 cm side margins.
    next(true);
    const LAND_RIGHT=282;
    doc.setFillColor(238,244,249);doc.roundedRect(L,y,LAND_RIGHT-L,9,1,1,'F');doc.setFont('helvetica','bold');doc.setTextColor(22,76,120);doc.setFontSize(11);doc.text('CRONOGRAMA DA OBRA',L+3,y+6);y+=17;
    const items=[...list(record.stages),...list(record.startDocs),...list(record.endDocs)].filter(s=>s.start||s.end);
    const days=items.flatMap(s=>[s.start,s.end].filter(Boolean).map(v=>new Date(String(v).slice(0,10)+'T12:00:00').getTime())).filter(Number.isFinite);
    if(days.length){
      const min=Math.min(...days),max=Math.max(...days),span=Math.max(86400000,max-min),labelW=70,chartX=L+labelW,chartW=LAND_RIGHT-chartX;
      doc.setFontSize(8);doc.setFont('helvetica','bold');doc.text('Atividade',L+2,y+4);doc.text(date(new Date(min).toISOString()),chartX,y+4);doc.text(date(new Date(max).toISOString()),LAND_RIGHT,y+4,{align:'right'});y+=8;
      for(const item of items){if(y+9>177){next(true);y=TOP;}
        doc.setFontSize(7.5);doc.setFont('helvetica','normal');doc.setTextColor(35,45,55);
        doc.text(val(item.name).slice(0,40),L+2,y+5);
        const start=new Date(String(item.start||item.end).slice(0,10)+'T12:00:00').getTime();const end=new Date(String(item.end||item.start).slice(0,10)+'T12:00:00').getTime();
        if(Number.isFinite(start)&&Number.isFinite(end)){
          const x=chartX+(Math.min(start,end)-min)/span*chartW;const w=Math.max(1,Math.abs(end-start)/span*chartW);
          doc.setFillColor(String(item.status).toUpperCase()==='CONCLUÍDO'?38:41,String(item.status).toUpperCase()==='CONCLUÍDO'?150:110,String(item.status).toUpperCase()==='CONCLUÍDO'?91:172);
          doc.roundedRect(x,y+1,w,5,1,1,'F');
        }
        doc.setDrawColor(232,237,242);doc.line(L,y+8,LAND_RIGHT,y+8);y+=9;
      }
    }else{doc.setFont('helvetica','normal');doc.text('Sem datas programadas.',L+2,y+6);}
  }else{
    table('Obras geradas',['Identificador','Endereço','Município'],(opts.linkedWorks||[]).map(w=>[shortId(w.id),w.address,w.city]),[30,105,45]);
    if(kind==='Diagnóstico')table('Topografias geradas',['Identificador','Endereço','Município'],(opts.linkedTopographies||[]).map(t=>[shortId(t.id),t.address,t.city]),[30,105,45]);
  }
  const count=doc.getNumberOfPages();
  for(let i=1;i<=count;i++){
    doc.setPage(i);const width=doc.internal.pageSize.getWidth(),height=doc.internal.pageSize.getHeight();const right=width-15;
    doc.setDrawColor(210,222,232);doc.setLineWidth(.3);doc.line(15,22,right,22);doc.line(15,height-21,right,height-21);
    doc.setTextColor(22,76,120);doc.setFont('helvetica','bold');doc.setFontSize(9);doc.text('SISTEMA DE GESTÃO DE OBRAS',15,14);
    doc.setFont('helvetica','normal');doc.setFontSize(8);doc.setTextColor(89,103,117);
    doc.text(`RELATÓRIO DE ${kind.toUpperCase()}  |  ${shortId(record.id)}`,right,19,{align:'right'});
    doc.text(`Emitido em: ${emitted}`,15,height-14);doc.text(`Página ${i} de ${count}`,right,height-14,{align:'right'});
  }
  doc.save(`Relatorio_${kind}_${shortId(record.id)}.pdf`);
}
