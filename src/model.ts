import type {
  PhotoReport as ReferencePhotoReport,
} from "./reference/types";

export const STAGES = [
  "Diagnóstico",
  "Estudo",
  "Projeto",
  "Checklist de Início de Obra",
  "Materiais",
  "Obrasoft",
  "Execução de Obra",
  "Instalação de Equipamento",
  "Reposição",
  "Testes",
  "Checklist de Conclusão de Obra",
] as const;

export const INITIAL_DOCS: [string, string][] = [
  [
    "Solicitação da obra / demanda",
    "Ofício, CI, PMSB, Ouvidoria, Prefeitura etc.",
  ],
  [
    "Sentença judicial",
    "Sentença expedida pelo Judiciário ordenando a execução da obra.",
  ],
  [
    "Diagnóstico",
    "Exigido para obras de melhoria do sistema.",
  ],
  [
    "Projeto / Levantamento – Aprovado pela Sabesp",
    "Deve contemplar todas as interferências existentes no local e escavações.",
  ],
  [
    "Cadastro das interferências",
    "Cadastro de todas as interferências presentes na obra.",
  ],
  [
    "Checklist COMGÁS",
    "Obrigatório quando houver redes da COMGÁS na área da obra (NTS 324 e 400).",
  ],
  [
    "Autorização Ambiental",
    "Necessária apenas quando aplicável.",
  ],
  [
    "Autorização de Concessionárias",
    "DER, MRS, Transpetro, entre outras.",
  ],
  [
    "Autorização da Secretaria de Obras",
    "Exigida somente no município de Suzano.",
  ],
  [
    "Autorização da Secretaria de Trânsito",
    "Obrigatória para todas as obras.",
  ],
  [
    "Autorização da Prefeitura para Atendimento de Área Irregular",
    "Necessário para o atendimento de áreas irregulares.",
  ],
  [
    "Relatório Fotográfico Inicial",
    "Obrigatório para todas as obras.",
  ],
  [
    "Plano de Sinalização Específico",
    "Conforme exigências do trânsito local.",
  ],
  [
    "Plano de Comunicação",
    "Plano informando a forma de realização da comunicação.",
  ],
  [
    "Plano de Contingência",
    "Conforme NTS 0324 e 0392.",
  ],
  [
    "Plano de Furo Aprovado pela Sabesp",
    "Deve conter levantamento de interferências conforme NTS 0324.",
  ],
  [
    "Relatório de Sondagens / Cavas-Testemunho",
    "Conforme requisitos da NTS 0324 e da NBR 17015.",
  ],
  [
    "APR",
    "Conforme NTS 0324 e 0392.",
  ],
  [
    "PAE",
    "Conforme NTS 0324 e 0392.",
  ],
];

export const FINAL_DOCS: [string, string][] = [
  [
    "Checklist de liberação de obra",
    "Exigido para início de todas as obras.",
  ],
  [
    "Relatórios de fiscalização de obra",
    "Controle da contratada contendo todas as etapas.",
  ],
  [
    "Teste de estanqueidade",
    "Somente para as obras de água.",
  ],
  [
    "Relatório de serviços não vinculados",
    "Quando houver serviços não vinculados.",
  ],
  [
    "Relatório de Poços de Visita",
    "Em obras que tenham PVs ou caixas deverá haver o relatório.",
  ],
  [
    "Registro de execução do furo",
    "Obrigatório em obras em HDD, devendo conter: profundidade por haste, pitch (ângulo) por haste, sequência de alargamento e controle da carga de puxamento.",
  ],
  [
    "Relatório de ocorrências e desvios",
    "Obrigatório em obras em HDD.",
  ],
];

export const STAGE_STATUS = [
  "CADASTRADO",
  "AGUARDANDO",
  "LIBERADO",
  "EM PLANEJAMENTO",
  "EM ANDAMENTO",
  "PARALISADO",
  "CANCELADO",
  "CONCLUÍDO",
  "NÃO SE APLICA",
] as const;

export const DOC_STATUS = [
  "CADASTRADO",
  "AGUARDANDO",
  "EM ANDAMENTO",
  "CANCELADO",
  "CONCLUÍDO",
  "NÃO SE APLICA",
] as const;

export const SEG_STATUS = [
  "AGUARDANDO",
  "EM EXECUÇÃO",
  "PARALISADO",
  "CONCLUÍDO",
  "CANCELADO",
] as const;

export const MUNICIPIOS = [
  "Suzano",
  "Poá",
  "Biritiba Mirim",
  "Salesópolis",
  "Guararema",
];

export const SERVICOS = [
  "Prolongamento",
  "Remanejamento",
  "Interligação",
  "Instalação de válvula",
  "Construção de PV",
  "Instalação de equipamento",
];

export const OBJETIVOS = [
  "Universalização",
  "Melhoria",
  "Empreendimento",
];

export const PAVIMENTOS = [
  "Terra",
  "Asfalto",
  "Cimentado",
  "Concreto",
  "Intertravado",
];

export type Status =
  | (typeof STAGE_STATUS)[number]
  | (typeof SEG_STATUS)[number];

export type Item = {
  attachments?: {
    id: string;
    name: string;
    mime: string;
    size: number;
  }[];
  id: string;
  name: string;
  guidance?: string;
  status: string;
  statusAt: string;
  responsible: string;
  start: string;
  end: string;
  note: string;
};

export type Point = {
  id: string;
  lat: number;
  lng: number;
};

export type Segment = {
  id: string;
  name: string;
  address: string;
  calculated: number;
  manual: number | null;
  status: string;
  from: string;
  to: string;
  lineId: string;
  district?: string;
  city?: string;
  state?: string;
  postcode?: string;
};

export type Polyline = {
  id: string;
  pointIds: string[];
};

export type BudgetRow = {
  id: string;
  description: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  priceNumber?: string;
};

export type PhotoReport = {
  id: string;
  title: string;
  date: string;
  status?: "EM ELABORAÇÃO" | "CONCLUÍDO";
  responsible?: string;
  reference?: ReferencePhotoReport;
  pdfFileId?: string;
  photos: {
    id: string;
    caption: string;
    data: string;
  }[];
};

export type Work = {
  dataValidated?: boolean;
  id: string;
  createdAt: string;
  address: string;
  district: string;
  city: string;
  goal: string;
  requester: string;
  requestDocument: string;
  notes: string;
  kind: string;
  ae: string;
  service: string;
  method: string;
  links: number;
  png: number;
  booster: number;
  vrp: number;
  priority: string;

  // Campo legado preservado por compatibilidade.
  // Não participa do cálculo da extensão da obra.
  manualLength: number | null;

  pavements: {
    type: string;
    length: number;
  }[];
  stages: Item[];
  startDocs: Item[];
  endDocs: Item[];
  points: Point[];
  lines: Polyline[];
  segments: Segment[];
  budget: BudgetRow[];
  reports: PhotoReport[];
};

export type User = {
  id: string;
  name: string;
  email: string;
  role: "admin" | "user";
  active: boolean;
  created_at?: string;
};

export type Audit = {
  id: string;
  workId: string;
  entity: string;
  entityId: string;
  field: string;
  before: string;
  after: string;
  actor: string;
  at: string;
};

export const uid = () => crypto.randomUUID();

export const dateToday = () =>
  new Date().getFullYear() +
  "-" +
  String(new Date().getMonth() + 1).padStart(2, "0") +
  "-" +
  String(new Date().getDate()).padStart(2, "0");

export const newItem = (
  name: string,
  guidance = "",
): Item => ({
  id: uid(),
  name,
  guidance,
  status: "CADASTRADO",
  statusAt: new Date().toISOString(),
  responsible: "",
  start: "",
  end: "",
  note: "",
});

export function newWork(): Work {
  return {
    id: uid(),
    createdAt: new Date().toISOString(),
    address: "",
    district: "",
    city: "Suzano",
    goal: "Melhoria",
    requester: "",
    requestDocument: "",
    notes: "",
    kind: "Linear",
    ae: "Água",
    service: "Prolongamento",
    method: "VCA",
    links: 0,
    png: 0,
    booster: 0,
    vrp: 0,
    priority: "Baixa",
    manualLength: null,
    pavements: [],
    stages: STAGES.map((s) => newItem(s)),
    startDocs: INITIAL_DOCS.map(
      ([name, guidance]) => newItem(name, guidance),
    ),
    endDocs: FINAL_DOCS.map(
      ([name, guidance]) => newItem(name, guidance),
    ),
    points: [],
    lines: [],
    segments: [],
    budget: [],
    reports: [],
  };
}

export const eligible = (status: string) =>
  !["CANCELADO", "NÃO SE APLICA"].includes(status);

export const finished = (status: string) =>
  [
    "CONCLUÍDO",
    "CANCELADO",
    "NÃO SE APLICA",
  ].includes(status);

export function progress(items: Item[]) {
  const eligibleItems = items.filter(
    (item) => eligible(item.status),
  );

  return eligibleItems.length
    ? Math.round(
        (
          100 *
          eligibleItems.filter(
            (item) => item.status === "CONCLUÍDO",
          ).length
        ) / eligibleItems.length,
      )
    : null;
}

export const segLength = (segment: Segment) =>
  Math.max(
    0,
    Number.isFinite(
      segment.manual ?? segment.calculated,
    )
      ? segment.manual ?? segment.calculated
      : 0,
  );

export const calculatedLength = (work: Work) =>
  work.segments
    .filter(
      (segment) => segment.status !== "CANCELADO",
    )
    .reduce(
      (sum, segment) => sum + segLength(segment),
      0,
    );

export const effectiveLength = (work: Work) =>
  calculatedLength(work);

export const executedLength = (work: Work) =>
  work.segments
    .filter(
      (segment) => segment.status === "CONCLUÍDO",
    )
    .reduce(
      (sum, segment) => sum + segLength(segment),
      0,
    );

export const executionPercent = (work: Work) =>
  effectiveLength(work) > 0
    ? (
        100 * executedLength(work)
      ) / effectiveLength(work)
    : 0;

export const budgetTotal = (work: Work) =>
  work.budget.reduce(
    (sum, row) =>
      sum + row.quantity * row.unitPrice,
    0,
  );

export function computedDocStage(docs: Item[]) {
  if (
    docs.every((doc) => finished(doc.status))
  ) {
    return "CONCLUÍDO";
  }

  if (
    docs.some(
      (doc) =>
        ![
          "CADASTRADO",
          "CANCELADO",
          "NÃO SE APLICA",
        ].includes(doc.status),
    )
  ) {
    return "EM ANDAMENTO";
  }

  return "CADASTRADO";
}

export function syncStages(work: Work): Work {
  const stages = work.stages.map((stage, index) => {
    if (index !== 3 && index !== 10) {
      return stage;
    }

    const docs =
      index === 3
        ? work.startDocs
        : work.endDocs;

    const active = docs.filter(
      (doc) => eligible(doc.status),
    );

    const starts = active
      .map((doc) => doc.start)
      .filter(Boolean)
      .sort();

    const ends = active
      .map((doc) => doc.end)
      .filter(Boolean)
      .sort();

    const status = computedDocStage(docs);

    return {
      ...stage,
      status,
      statusAt:
        status === stage.status
          ? stage.statusAt
          : new Date().toISOString(),
      start: starts[0] || "",
      end: ends.at(-1) || "",
    };
  });

  return {
    ...work,
    stages,
  };
}

export const workStatus = (work: Work) =>
  work.stages[6]?.status === "CANCELADO"
    ? "CANCELADO"
    : work.stages.every(
        (stage) => finished(stage.status),
      )
      ? "CONCLUÍDO"
      : work.stages[6]?.status || "CADASTRADO";

export const overdue = (
  status: string,
  end: string,
) =>
  !!end &&
  end < dateToday() &&
  !finished(status);

export const statusColor = (
  status: string,
  end = "",
) =>
  overdue(status, end)
    ? "red"
    : status === "CONCLUÍDO"
      ? "green"
      : status === "PARALISADO"
        ? "red"
        : [
            "CANCELADO",
            "NÃO SE APLICA",
          ].includes(status)
          ? "gray"
          : [
              "CADASTRADO",
              "AGUARDANDO",
            ].includes(status)
            ? "yellow"
            : "blue";

export const money = (value: number) =>
  new Intl.NumberFormat(
    "pt-BR",
    {
      style: "currency",
      currency: "BRL",
    },
  ).format(value);

export const meters = (value: number) =>
  new Intl.NumberFormat(
    "pt-BR",
    {
      maximumFractionDigits: 0,
    },
  ).format(Math.round(value));

export const normalize = (value: string) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

export function distance(
  a: Point,
  b: Point,
) {
  const rad = Math.PI / 180;
  const radius = 6371000;

  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;

  const q =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) *
      Math.cos(b.lat * rad) *
      Math.sin(dLng / 2) ** 2;

  return Math.round(
    2 * radius * Math.asin(Math.sqrt(q)),
  );
}
