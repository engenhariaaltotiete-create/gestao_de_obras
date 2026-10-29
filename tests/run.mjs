import test from "node:test";
import assert from "node:assert/strict";
import {
  newWork,
  STAGES,
  syncStages,
  executionStatus,
  executionPercent,
  effectiveLength,
} from "../src/model.ts";
import { forecast, validRange } from "../src/domains/planning.ts";
import { changedFields } from "../src/domains/audit.ts";
import {
  timelineRange,
  calendarTicks,
  monthLabel,
  financialMonth,
} from "../src/domains/timeline.ts";

test("12 etapas: migração preserva IDs, datas, responsáveis e anexos e é idempotente", () => {
  const w = newWork();
  w.stages = w.stages.filter((s) => s.name !== "LIG/PNG");
  const equipment = w.stages.find(
    (s) => s.name === "Instalação de Equipamento",
  );
  equipment.note = "Preservar";
  equipment.responsible = "usuario";
  equipment.start = "2026-10-01";
  equipment.attachments = [
    { id: "a", name: "teste", mime: "text/plain", size: 1 },
  ];
  w.stages.splice(7, 0, w.stages.splice(w.stages.indexOf(equipment), 1)[0]);
  const next = syncStages(w);
  assert.deepEqual(
    next.stages.map((s) => s.name),
    STAGES,
  );
  assert.deepEqual(next.stages[10], equipment);
  assert.deepEqual(syncStages(next), next);
  assert.equal(next.stages[7].status, "CADASTRADO");
});
test("status de execução é independente das demais etapas e dos trechos", () => {
  const w = newWork();
  w.stages[6].status = "CONCLUÍDO";
  assert.equal(executionStatus(w), "CONCLUÍDO");
  w.stages[6].status = "AGUARDANDO";
  w.stages
    .filter((s) => s !== w.stages[6])
    .forEach((s) => (s.status = "CONCLUÍDO"));
  assert.equal(executionStatus(w), "AGUARDANDO");
});
test("checklists sincronizam por nome após mudança da ordem", () => {
  const w = newWork();
  w.endDocs.forEach((d) => {
    d.status = "CONCLUÍDO";
    d.start = "2026-11-01";
    d.end = "2026-11-02";
  });
  const next = syncStages(w);
  assert.equal(next.stages[11].status, "CONCLUÍDO");
  assert.equal(next.stages[11].start, "2026-11-01");
  assert.equal(next.stages[10].status, "CADASTRADO");
});
test("percentual usa extensão ativa, incluindo manual e excluindo cancelados", () => {
  const w = newWork();
  w.segments = [
    { id: "a", calculated: 50, manual: null, status: "CONCLUÍDO" },
    { id: "b", calculated: 20, manual: 50, status: "AGUARDANDO" },
    { id: "c", calculated: 100, manual: null, status: "CANCELADO" },
  ];
  assert.equal(effectiveLength(w), 100);
  assert.equal(executionPercent(w), 50);
});
test("previsões dividem semana que atravessa mês sem duplicar extensão, ligações ou centavos", () => {
  const w = newWork();
  w.segments = [
    { id: "s", calculated: 700, manual: null, status: "AGUARDANDO" },
  ];
  w.links = 13;
  w.budget = [{ quantity: 1, unitPrice: 100.01 }];
  w.stages[6].start = "2026-10-29";
  w.stages[6].end = "2026-11-04";
  const buckets = forecast([w]);
  assert.ok(buckets.some((b) => b.key === "2026-10|2026-10-26"));
  assert.ok(buckets.some((b) => b.key === "2026-11|2026-10-26"));
  assert.equal(
    buckets.reduce((n, b) => n + b.length, 0),
    700,
  );
  assert.equal(
    buckets.reduce((n, b) => n + b.links, 0),
    13,
  );
  assert.equal(
    buckets.reduce((n, b) => n + b.cents, 0),
    10001,
  );
  assert.equal(buckets.filter((b) => b.links)[0].end, "2026-11-04");
});
test("datas e eixos usam mês abreviado, semanas na segunda-feira e orçamento MM/AAAA", () => {
  assert.equal(validRange("2026-02-30", "2026-03-02"), false);
  assert.equal(validRange("2026-11-02", "2026-11-01"), false);
  const range = timelineRange([{ start: "2026-10-01", end: "2026-11-05" }]);
  const ticks = calendarTicks(range);
  assert.equal(monthLabel("2026-10"), "OUT/2026");
  assert.equal(financialMonth("2026-10"), "10/2026");
  assert.deepEqual(
    ticks.weeks.map((w) => w.label),
    ["05", "12", "19", "26", "02"],
  );
  assert.equal(
    ticks.months.reduce((n, m) => n + (m.end - m.start) / 86400000, 0),
    range.span,
  );
});
test("auditoria guarda apenas campos alterados e ignora reordenação das entidades", () => {
  const a = {
    address: "Rua A",
    stages: [
      { id: "x", status: "AGUARDANDO", note: "igual" },
      { id: "y", status: "CONCLUÍDO" },
    ],
  };
  const b = {
    address: "Rua B",
    stages: [
      { id: "y", status: "CONCLUÍDO" },
      { id: "x", status: "EM ANDAMENTO", note: "igual" },
    ],
  };
  assert.deepEqual(changedFields(a, b), {
    address: { anterior: "Rua A", novo: "Rua B" },
    "stages[x].status": { anterior: "AGUARDANDO", novo: "EM ANDAMENTO" },
  });
  assert.deepEqual(changedFields(a, a), {});
  assert.ok(changedFields(a, { ...a, stages: [] })["stages[x]"]);
});
await import("./database.mjs");
await import("./sketch.mjs");
await import("./google-oauth.mjs");
await import("./file-links.mjs");
await import("./work-identity.mjs");

await import("./business-rules.mjs");
