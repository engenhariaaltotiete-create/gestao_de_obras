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
  ["file", "blob", "base64", "dataUrl", "url", "cancellationStatuses"].includes(key) ||
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
  options?: { population?: number; linkedWorks?: Work[]; linkedTopographies?: RecordData[] },
) {
  try {
    const { generateTechnicalPdf } = await import('./technicalPdf');
    await generateTechnicalPdf(kind, record, options);
  } catch (error) {
    alert('Não foi possível gerar o PDF: ' + (error instanceof Error ? error.message : String(error)));
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
