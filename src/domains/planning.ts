import {
  budgetTotal,
  executionStage,
  effectiveLength,
  eligible,
  type Work,
} from "../model.ts";

const DAY = 86400000;

export const day = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return NaN;
  }

  const timestamp = Date.parse(value + "T00:00:00Z");

  return Number.isFinite(timestamp) &&
    new Date(timestamp).toISOString().slice(0, 10) === value
    ? timestamp
    : NaN;
};

export function validRange(start: string, end: string) {
  return (
    Number.isFinite(day(start)) &&
    Number.isFinite(day(end)) &&
    day(end) >= day(start)
  );
}

export function workRange(work: Work) {
  const items = work.stages.filter((stage) => eligible(stage.status));

  const starts = items
    .map((stage) => stage.start)
    .filter((value) => Number.isFinite(day(value)))
    .sort();

  const ends = items
    .map((stage) => stage.end)
    .filter((value) => Number.isFinite(day(value)))
    .sort();

  return {
    start: starts[0] || "",
    end: ends.at(-1) || "",
  };
}

export type Bucket = {
  key: string;
  month: string;
  start: string;
  end: string;
  days: number;
  length: number;
  links: number;
  cents: number;
};

// Dias civis inclusivos em UTC.
// Semanas que atravessam meses são divididas
// em grupos distintos, sem duplicar dias.

export function forecast(works: Work[]): Bucket[] {
  const map = new Map<string, Bucket>();

  for (const work of works) {
    const stage = executionStage(work);

    if (
      !stage ||
      !eligible(stage.status) ||
      !validRange(stage.start, stage.end)
    ) {
      continue;
    }

    const start = day(stage.start);
    const end = day(stage.end);
    const total = (end - start) / DAY + 1;

    const groups = new Map<
      string,
      {
        start: string;
        end: string;
        days: number;
      }
    >();

    for (let timestamp = start; timestamp <= end; timestamp += DAY) {
      const date = new Date(timestamp);

      const iso = date.toISOString().slice(0, 10);

      const month = iso.slice(0, 7);

      const monday = new Date(timestamp - ((date.getUTCDay() + 6) % 7) * DAY)
        .toISOString()
        .slice(0, 10);

      const key = month + "|" + monday;
      const previous = groups.get(key);

      groups.set(key, {
        start: previous?.start || iso,
        end: iso,
        days: (previous?.days || 0) + 1,
      });
    }

    const cents = Math.round(budgetTotal(work) * 100);

    let used = 0;
    let elapsed = 0;

    for (const [key, group] of groups) {
      elapsed += group.days;

      const cumulative = Math.round((cents * elapsed) / total);

      const allocated = cumulative - used;
      used = cumulative;

      const bucket = map.get(key) || {
        key,
        month: key.slice(0, 7),
        ...group,
        length: 0,
        links: 0,
        cents: 0,
      };

      bucket.start = bucket.start < group.start ? bucket.start : group.start;

      bucket.end = bucket.end > group.end ? bucket.end : group.end;

      bucket.length += (effectiveLength(work) * group.days) / total;

      bucket.cents += allocated;

      // Ligações são atribuídas integralmente
      // à semana de término da execução.
      if (group.end === stage.end) {
        bucket.links += work.links;
      }

      map.set(key, bucket);
    }
  }

  return [...map.values()].sort((a, b) => a.key.localeCompare(b.key));
}

export function validateWork(work: Work) {
  const labels: Partial<Record<keyof Work, string>> = {
    address: "Endereço",
    district: "Bairro",
    city: "Município",
    goal: "Objetivo",
    requester: "Solicitante",
    requestDocument: "Documento de solicitação",
    kind: "Tipo de obra",
    ae: "Água/Esgoto",
    service: "Serviço",
    method: "Método",
    priority: "Prioridade",
    createdAt: "Data de cadastro",
  };

  const errors = Object.entries(labels)
    .filter(([key]) => !String(work[key as keyof Work] ?? "").trim())
    .map(([, label]) => label + " é obrigatório.");

  for (const key of ["links", "png", "booster", "vrp"] as const) {
    if (!Number.isFinite(work[key]) || work[key] < 0) {
      errors.push(key + ": informe um número maior ou igual a zero.");
    }
  }

  if (
    work.pavements.some(
      (pavement) => !Number.isFinite(pavement.length) || pavement.length < 0,
    )
  ) {
    errors.push("Informe extensões válidas dos pavimentos.");
  }

  if (!work.pavements.length) {
    errors.push("Selecione ao menos um pavimento.");
  }

  return errors;
}
