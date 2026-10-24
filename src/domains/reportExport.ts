/** Exports isolated from the registration, persistence and audit flows. */
import type { Work } from "../model";

type RecordData = Record<string, unknown>;
type ReportKind = "Obra" | "Diagnóstico" | "Topografia";
const LABELS: Record<string, string> = {
  id: "Identificador",
  createdAt: "Data de cadastro",
  address: "Endereço",
  district: "Bairro",
  city: "Município",
  goal: "Objetivo",
  requester: "Solicitante",
  requestDocument: "Documento da solicitação",
  notes: "Observações",
  kind: "Tipo",
  ae: "Água/Esgoto",
  service: "Serviço",
  method: "Método",
  links: "Ligações",
  png: "PNG",
  booster: "Booster",
  vrp: "VRP",
  priority: "Prioridade",
  manualLength: "Extensão manual",
  status: "Situação",
  statusAt: "Data da situação",
  plannedStart: "Previsão de início",
  plannedEnd: "Previsão de término",
  pavements: "Pavimentos",
  stages: "Etapas",
  startDocs: "Checklist de início",
  endDocs: "Checklist de conclusão",
  points: "Pontos do croqui",
  lines: "Linhas do croqui",
  segments: "Trechos do croqui",
  budget: "Orçamento",
  reports: "Relatórios fotográficos",
  originDiagnosticId: "Diagnóstico de origem",
  originTopographyId: "Topografia de origem",
  name: "Nome",
  length: "Extensão (m)",
  type: "Tipo",
  from: "Origem",
  to: "Destino",
  guidance: "Orientações",
  start: "Início",
  end: "Término",
  value: "Valor",
  quantity: "Quantidade",
  unit: "Unidade",
  description: "Descrição",
  caption: "Legenda",
  data: "Data",
  lineId: "Linha",
  pointIds: "Pontos",
  lat: "Latitude",
  lng: "Longitude",
  population: "População atendida (habitantes)",
  responsible: "Responsável (identificador)",
  note: "Observação",
  calculated: "Extensão calculada (m)",
  manual: "Extensão informada (m)",
  unitPrice: "Preço unitário",
  priceNumber: "Item de preço",
  attachments: "Anexos",
  date: "Data",
  title: "Título",
  photos: "Fotos",
  reference: "Dados do relatório",
  registroId: "Identificador do registro",
  ordem: "Ordem",
};
const label = (s: string) => LABELS[s] || s.replace(/([a-z])([A-Z])/g, "$1 $2");
const isObject = (v: unknown): v is RecordData =>
  !!v && typeof v === "object" && !Array.isArray(v);
const hidden = (key: string, value: unknown) =>
  key.startsWith("_") ||
  ["file", "blob", "base64", "dataUrl", "url"].includes(key) ||
  (key === "data" &&
    typeof value === "string" &&
    /^(data:|blob:)/i.test(value));
const entries = (value: RecordData) =>
  Object.entries(value).filter(([key, v]) => !hidden(key, v));
const text = (v: unknown): string =>
  v === null || v === undefined || v === ""
    ? "—"
    : typeof v === "boolean"
      ? v
        ? "Sim"
        : "Não"
      : typeof v === "number"
        ? String(v)
        : typeof v === "string"
          ? v
          : Array.isArray(v)
            ? v
                .map((x) =>
                  isObject(x)
                    ? entries(x)
                        .filter(([k]) => k !== "id")
                        .map(([k, val]) => `${label(k)}: ${text(val)}`)
                        .join("; ")
                    : text(x),
                )
                .join(" | ")
            : isObject(v)
              ? entries(v)
                  .map(([k, val]) => `${label(k)}: ${text(val)}`)
                  .join("; ")
              : String(v);

const xml = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
const safeName = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_-]+/gi, "_")
    .slice(0, 65);
const download = (content: Blob, name: string) => {
  const url = URL.createObjectURL(content);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
};

/** Native Excel 2003 XML workbook (.xls): multiple related sheets, no extra package. */
export function exportExcel(kind: ReportKind, records: RecordData[]) {
  if (!records.length) {
    alert("Não há registros para exportar.");
    return;
  }
  const nested = [
    "points",
    "lines",
    "segments",
    "pavements",
    "stages",
    "startDocs",
    "endDocs",
    "budget",
    "reports",
  ];
  const sheets: { name: string; headers: string[]; rows: unknown[][] }[] = [];
  const basicKeys = [
    ...new Set(
      records.flatMap((r) =>
        Object.keys(r).filter((k) => !nested.includes(k) && !hidden(k, r[k])),
      ),
    ),
  ];
  sheets.push({
    name: "Dados gerais",
    headers: basicKeys.map(label),
    rows: records.map((r) => basicKeys.map((k) => r[k])),
  });
  for (const key of nested) {
    const rows: RecordData[] = [];
    for (const record of records) {
      const arr = record[key];
      if (!Array.isArray(arr)) continue;
      arr.forEach((item, index) => {
        if (isObject(item)) {
          const fields = Object.fromEntries(entries(item));
          rows.push({ registroId: record.id, ordem: index + 1, ...fields });
        } else
          rows.push({ registroId: record.id, ordem: index + 1, valor: item });
      });
    }
    if (!rows.length) continue;
    const keys = [...new Set(rows.flatMap((r) => Object.keys(r)))];
    sheets.push({
      name: label(key).slice(0, 31),
      headers: keys.map(label),
      rows: rows.map((r) => keys.map((k) => r[k])),
    });
  }
  const sheetXml = sheets
    .map(
      (s) =>
        `<Worksheet ss:Name="${xml(s.name)}"><Table><Row>${s.headers.map((h) => `<Cell ss:StyleID="header"><Data ss:Type="String">${xml(h)}</Data></Cell>`).join("")}</Row>${s.rows.map((row) => `<Row>${row.map((v) => `<Cell><Data ss:Type="${typeof v === "number" && Number.isFinite(v) ? "Number" : "String"}">${xml(typeof v === "number" && Number.isFinite(v) ? String(v) : text(v))}</Data></Cell>`).join("")}</Row>`).join("")}</Table><WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel"><FreezePanes/><FrozenNoSplit/><SplitHorizontal>1</SplitHorizontal><TopRowBottomPane>1</TopRowBottomPane></WorksheetOptions></Worksheet>`,
    )
    .join("");
  const body = `<?xml version="1.0" encoding="UTF-8"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Styles><Style ss:ID="header"><Font ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#164C78" ss:Pattern="Solid"/></Style></Styles>${sheetXml}</Workbook>`;
  download(
    new Blob([body], { type: "application/vnd.ms-excel;charset=utf-8" }),
    `Relatorio_${safeName(kind)}_${new Date().toISOString().slice(0, 10)}.xls`,
  );
}

export async function exportPdf(
  kind: ReportKind,
  record: RecordData,
  options?: {
    population?: number;
    linkedWorks?: Work[];
    linkedTopographies?: RecordData[];
  },
) {
  try {
    const { jsPDF } = await import("jspdf");
    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
      compress: true,
    });
    const top = 30,
      bottom = 267,
      left = 15,
      right = 195;
    let y = top;
    const emitted = new Date().toLocaleString("pt-BR");
    const newPage = () => {
      pdf.addPage();
      y = top;
    };
    const need = (h: number) => {
      if (y + h > bottom) newPage();
    };
    const heading = (title: string) => {
      need(20);
      pdf.setFillColor(238, 244, 249);
      pdf.roundedRect(left, y, 180, 9, 1.2, 1.2, "F");
      pdf.setTextColor(22, 76, 120);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(11);
      pdf.text(title.toUpperCase(), left + 3, y + 6.2);
      y += 13;
    };
    const line = (k: string, v: unknown) => {
      pdf.setFontSize(9);
      pdf.setFont("helvetica", "normal");
      const values = pdf.splitTextToSize(text(v), 110) as string[];
      pdf.setFont("helvetica", "bold");
      const labels = pdf.splitTextToSize(label(k), 62) as string[];
      let vi = 0,
        li = 0;
      while (vi < values.length || li < labels.length) {
        need(7);
        const count = Math.min(
          Math.max(values.length - vi, labels.length - li),
          Math.max(1, Math.floor((bottom - y - 2) / 4.4)),
        );
        const h = Math.max(7, count * 4.4 + 2);
        const labelLines = labels.slice(li, li + count),
          valueLines = values.slice(vi, vi + count);
        const spacing = { lineHeightFactor: 4.4 / ((9 * 25.4) / 72) };
        pdf.setFont("helvetica", "bold");
        pdf.setTextColor(68, 83, 98);
        if (labelLines.length) pdf.text(labelLines, left + 2, y + 4, spacing);
        pdf.setFont("helvetica", "normal");
        pdf.setTextColor(33, 45, 58);
        if (valueLines.length) pdf.text(valueLines, left + 68, y + 4, spacing);
        pdf.setDrawColor(229, 234, 239);
        pdf.line(left, y + h - 1, right, y + h - 1);
        vi += valueLines.length;
        li += labelLines.length;
        y += h;
      }
    };

    const objectRows = (obj: RecordData, exclude: string[] = []) =>
      Object.entries(obj)
        .filter(
          ([k, v]) =>
            !exclude.includes(k) &&
            !hidden(k, v) &&
            !Array.isArray(v) &&
            !isObject(v),
        )
        .forEach(([k, v]) => line(k, v));
    const sectionArray = (key: string, value: unknown) => {
      heading(label(key));
      if (!Array.isArray(value) || !value.length) {
        line("Informações", "Não informado");
        return;
      }
      value.forEach((item, index) => {
        need(14);
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(9);
        const title = `${index + 1}. ${isObject(item) && typeof item.name === "string" ? item.name : label(key)}`;
        const titleLines = pdf.splitTextToSize(title, 176) as string[];
        titleLines.forEach((part: string) => {
          need(7);
          pdf.setFont("helvetica", "bold");
          pdf.setTextColor(22, 76, 120);
          pdf.setFontSize(9);
          pdf.text(part, left + 2, y + 4);
          y += 4.4;
        });
        y += 2.6;
        if (isObject(item)) objectRows(item, ["id", "name"]);
        else line("Valor", item);
      });
    };

    const drawSketch = () => {
      heading("Croqui");
      const pts = Array.isArray(record.points)
        ? record.points.filter(isObject)
        : [];
      const segs = Array.isArray(record.segments)
        ? record.segments.filter(isObject)
        : [];
      if (!pts.length || !segs.length) {
        line("Croqui", "Sem trechos cadastrados");
        return;
      }
      need(86);
      const mapY = y,
        mapH = 76;
      pdf.setFillColor(247, 249, 252);
      pdf.roundedRect(left, mapY, 180, mapH, 1.5, 1.5, "F");
      const valid = pts.filter(
        (p) => Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng)),
      );
      const xs = valid.map((p) => Number(p.lng)),
        ys = valid.map((p) => Number(p.lat));
      if (!valid.length) {
        line("Croqui", "Coordenadas indisponíveis");
        return;
      }
      const minX = Math.min(...xs),
        maxX = Math.max(...xs),
        minY = Math.min(...ys),
        maxY = Math.max(...ys);
      const spanX = Math.max(maxX - minX, 0.000001),
        spanY = Math.max(maxY - minY, 0.000001);
      const scale = Math.min(165 / spanX, 60 / spanY);
      const xoff = (180 - spanX * scale) / 2,
        yoff = (mapH - spanY * scale) / 2;
      const pos = (p: RecordData): [number, number] => [
        left + xoff + (Number(p.lng) - minX) * scale,
        mapY + mapH - yoff - (Number(p.lat) - minY) * scale,
      ];
      const byId = new Map(valid.map((p) => [String(p.id), p]));
      pdf.setLineWidth(0.7);
      segs.forEach((s) => {
        const a = byId.get(String(s.from)),
          b = byId.get(String(s.to));
        if (!a || !b) return;
        const [ax, ay] = pos(a),
          [bx, by] = pos(b);
        pdf.setDrawColor(
          String(s.status) === "CONCLUÍDO" ? 34 : 31,
          String(s.status) === "CONCLUÍDO" ? 151 : 105,
          String(s.status) === "CONCLUÍDO" ? 84 : 170,
        );
        pdf.line(ax, ay, bx, by);
      });
      pdf.setFillColor(23, 77, 119);
      valid.forEach((p) => {
        const [px, py] = pos(p);
        pdf.circle(px, py, 1, "F");
      });
      y = mapY + mapH + 5;
      sectionArray("Trechos do croqui", segs);
    };
    // All pages share header, footer, issuance date and pagination.
    const generic = record as RecordData;
    heading(`Relatório de ${kind}`);
    line("Identificação", generic.id);
    line("Endereço", generic.address);
    heading(
      kind === "Obra"
        ? "Dados da obra"
        : kind === "Diagnóstico"
          ? "Dados do diagnóstico"
          : "Dados da topografia",
    );
    objectRows(generic, [
      "id",
      "address",
      "manualLength",
      "originDiagnosticId",
      "originTopographyId",
    ]);
    if (kind === "Obra") {
      const population =
        options?.population ?? (Number(generic.links) || 0) * 4;
      if (!Number.isSafeInteger(population) || population < 0)
        throw new Error(
          "População atendida inválida. Confira o número de ligações.",
        );
      line("População atendida (habitantes)", population);
    }
    drawSketch();
    if (kind === "Obra") {
      sectionArray("Pavimentos", generic.pavements);
      sectionArray("Orçamento", generic.budget);
      sectionArray("Etapas", generic.stages);
      sectionArray("Checklist de início", generic.startDocs);
      sectionArray("Checklist de conclusão", generic.endDocs);
      // Reports/photos intentionally excluded from the Obras PDF.
    } else {
      heading("Obras geradas");
      const related = options?.linkedWorks || [];
      if (!related.length) line("Obras", "Nenhuma obra gerada");
      else
        related.forEach((w) => {
          line("Obra", `${w.address || w.id} — ${w.city || ""}`);
        });
      if (kind === "Diagnóstico") {
        heading("Topografias geradas");
        const topographies = options?.linkedTopographies || [];
        if (!topographies.length)
          line("Topografias", "Nenhuma topografia gerada");
        else
          topographies.forEach((t) =>
            line("Topografia", `${text(t.address)} — ${text(t.city)}`),
          );
      }
    }
    const pages = pdf.getNumberOfPages();
    for (let page = 1; page <= pages; page++) {
      pdf.setPage(page);
      pdf.setDrawColor(211, 221, 230);
      pdf.setLineWidth(0.35);
      pdf.line(left, 22, right, 22);
      pdf.line(left, 276, right, 276);
      pdf.setTextColor(22, 76, 120);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(9);
      pdf.text("SISTEMA DE GESTÃO DE OBRAS", left, 14);
      pdf.setFont("helvetica", "normal");
      pdf.setTextColor(89, 103, 117);
      pdf.setFontSize(8);
      pdf.text(
        `RELATÓRIO DE ${kind.toUpperCase()}  |  ${String(generic.id || "").slice(0, 18)}`,
        right,
        19,
        { align: "right" },
      );
      pdf.text(`Emitido em: ${emitted}`, left, 283);
      pdf.text(`Página ${page} de ${pages}`, right, 283, { align: "right" });
    }
    pdf.save(
      `Relatorio_${safeName(kind)}_${safeName(String(generic.address || generic.id || "registro"))}.pdf`,
    );
  } catch (error) {
    alert(
      "Não foi possível gerar o PDF: " +
        (error instanceof Error ? error.message : String(error)),
    );
  }
}

export function exportWorkPdf(work: Work) {
  const raw = window.prompt(
    "População atendida (habitantes). Deixe vazio para utilizar 4 × número de ligações:",
    "",
  );
  if (raw === null) return;
  const entered = raw.trim();
  if (
    entered &&
    (!/^(0|[1-9]\d*)$/.test(entered) || !Number.isSafeInteger(Number(entered)))
  ) {
    alert("Informe um número inteiro não negativo ou deixe o campo vazio.");
    return;
  }
  exportPdf("Obra", work as unknown as RecordData, {
    population: entered ? Number(entered) : undefined,
  });
}
