import test from "node:test";
import assert from "node:assert/strict";
import { newWork, syncStages, executionPercent } from "../src/model.ts";

test("cancelamento restaura status por ID após persistência e preserva demais campos", () => {
  const original = newWork();
  original.stages[0].status = "CONCLUÍDO";
  original.startDocs[0].status = "EM ANDAMENTO";
  original.endDocs[0].status = "NÃO SE APLICA";
  original.stages[6].status = "EM ANDAMENTO";
  original.startDocs[0].note = "Preservar";
  original.startDocs[0].start = "2026-10-01";
  const before = syncStages(original);
  let cancelled = structuredClone(before);
  cancelled.stages[6].status = "CANCELADO";
  cancelled = syncStages(cancelled);
  for (const group of ["stages", "startDocs", "endDocs"]) {
    assert.ok(cancelled[group].every((i) => i.status === "CANCELADO"));
    assert.equal(
      before[group].some((i) => i.status !== "CANCELADO"),
      true,
    );
  }
  assert.deepEqual(syncStages(cancelled), cancelled);
  let restored = JSON.parse(JSON.stringify(cancelled));
  restored.startDocs.reverse();
  restored.stages[6].status = "LIBERADO";
  restored = syncStages(restored);
  assert.equal(restored.cancellationStatuses, undefined);
  for (const group of ["stages", "startDocs", "endDocs"]) {
    for (const item of before[group]) {
      const next = restored[group].find((i) => i.id === item.id);
      assert.equal(
        next.status,
        item.name === "Execução de Obra" ? "LIBERADO" : item.status,
      );
      assert.equal(next.note, item.note);
      assert.equal(next.start, item.start);
      assert.equal(next.end, item.end);
    }
  }
  restored.stages[6].status = "CANCELADO";
  restored = syncStages(restored);
  restored.stages[6].status = "CONCLUÍDO";
  restored = syncStages(restored);
  assert.equal(restored.stages[0].status, "CONCLUÍDO");
  assert.equal(executionPercent(restored), 100);
});

test("cancelamento impede alteração isolada dos status e conserva o histórico salvo", () => {
  const w = newWork();
  w.stages[6].status = "CANCELADO";
  const cancelled = syncStages(w);
  const changed = structuredClone(cancelled);
  changed.startDocs[0].status = "CONCLUÍDO";
  const normalized = syncStages(changed);
  assert.equal(normalized.startDocs[0].status, "CANCELADO");
  assert.deepEqual(
    normalized.cancellationStatuses,
    cancelled.cancellationStatuses,
  );
});

test("somente obra sem trechos concluída assume 100%, sem mudar cálculo dos trechos", () => {
  const w = newWork();
  assert.equal(executionPercent(w), 0);
  w.stages[6].status = "CONCLUÍDO";
  assert.equal(executionPercent(w), 100);
  w.segments = [{ id: "a", manual: null, calculated: 10, status: "CANCELADO" }];
  assert.equal(executionPercent(w), 0);
  w.segments = [
    { id: "a", manual: null, calculated: 10, status: "CONCLUÍDO" },
    { id: "b", manual: null, calculated: 30, status: "AGUARDANDO" },
  ];
  assert.equal(executionPercent(w), 25);
});

test("PostgreSQL aplica cascata, protege histórico e restaura CADASTRADO sem permitir edição manual", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { readFile } = await import("node:fs/promises");
  const db = new PGlite();
  const actor = crypto.randomUUID();
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
      create schema auth;create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema public,auth to anon,authenticated,service_role;
      grant execute on function auth.uid() to anon,authenticated,service_role;`);
    for (const name of [
      "001_schema_teste.sql",
      "002_sync.sql",
      "004_security.sql",
      "005_hardening.sql",
      "006_file_audit.sql",
      "007_stages_and_grouped_audit.sql",
      "008_diagnosticos.sql",
      "009_topografias.sql",
      "010_work_identity.sql",
      "011_work_cancellation.sql",
      "011_work_cancellation.sql",
    ]) {
      await db.exec(
        await readFile(new URL("../supabase/" + name, import.meta.url), "utf8"),
      );
    }
    await db.query("insert into auth.users values($1,$2,$3)", [
      actor,
      "test@example.com",
      "{}",
    ]);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      actor,
    ]);
    await db.exec(
      "grant select on obras to authenticated; set role authenticated",
    );
    const w = newWork();
    w.stages[6].status = "EM ANDAMENTO";
    w.stages[0].status = "CONCLUÍDO";
    w.startDocs[0].status = "NÃO SE APLICA";
    let revision = null;
    const save = async (payload) => {
      const result = (
        await db.query("select save_work_if_revision($1,$2,$3,$4) result", [
          w.id,
          w.createdAt,
          JSON.stringify(payload),
          revision,
        ])
      ).rows[0].result;
      assert.equal(result.ok, true);
      revision = result.revision;
      return (await db.query("select payload from obras where id=$1", [w.id]))
        .rows[0].payload;
    };
    await save(w);
    const cancelled = structuredClone(w);
    cancelled.stages[6].status = "CANCELADO";
    let result = await save(cancelled);
    for (const group of ["stages", "startDocs", "endDocs"])
      assert.ok(result[group].every((i) => i.status === "CANCELADO"));
    result.cancellationStatuses.startDocs[w.startDocs[1].id] = "CONCLUÍDO";
    result.startDocs[1].status = "CONCLUÍDO";
    result = await save(result);
    assert.equal(result.startDocs[1].status, "CANCELADO");
    assert.equal(
      result.cancellationStatuses.startDocs[w.startDocs[1].id],
      "CADASTRADO",
    );
    result.stages[6].status = "LIBERADO";
    result = await save(result);
    assert.equal(result.stages[6].status, "LIBERADO");
    assert.equal(result.stages[0].status, "CONCLUÍDO");
    assert.equal(result.startDocs[0].status, "NÃO SE APLICA");
    assert.equal(result.startDocs[1].status, "CADASTRADO");
    assert.equal(result.cancellationStatuses, undefined);
    result.startDocs[1].status = "AGUARDANDO";
    result = await save(result);
    result.startDocs[1].status = "CADASTRADO";
    await assert.rejects(save(result), /selecione outro status/);
  } finally {
    await db.close();
  }
});

test("cancelamento normaliza etapas legadas sem perder o histórico", () => {
  const w = newWork();
  w.stages = w.stages.filter((i) => i.name !== "LIG/PNG");
  w.stages.find((i) => i.name === "Execução de Obra").status = "CANCELADO";
  const next = syncStages(w);
  assert.equal(next.stages.length, 12);
  assert.ok(next.stages.every((i) => i.status === "CANCELADO"));
  assert.deepEqual(syncStages(next), next);
});
