import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { newWork } from "../src/model.ts";

test("integridade da obra impede payload com ID divergente e preserva operações válidas", async () => {
  const db = new PGlite();
  const admin = crypto.randomUUID();
  try {
    await db.exec(
      `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to anon,authenticated,service_role;grant execute on function auth.uid() to anon,authenticated,service_role;`,
    );
    for (const name of [
      "001_schema_teste.sql",
      "002_sync.sql",
      "004_security.sql",
      "005_hardening.sql",
      "006_file_audit.sql",
      "007_stages_and_grouped_audit.sql",
      "008_diagnosticos.sql",
      "009_topografias.sql",
    ])
      await db.exec(
        await readFile(new URL("../supabase/" + name, import.meta.url), "utf8"),
      );
    await db.query("insert into auth.users values($1,$2,$3)", [
      admin,
      "admin@example.com",
      "{}",
    ]);
    await db.query("update profiles set role='admin' where id=$1", [admin]);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      admin,
    ]);
    const work = newWork(),
      different = crypto.randomUUID();
    const save = (id, payload, revision = null) =>
      db.query("select save_work_if_revision($1,$2,$3,$4) result", [
        id,
        work.createdAt,
        JSON.stringify(payload),
        revision,
      ]);
    await db.exec("begin");
    assert.equal(
      (await save(different, work)).rows[0].result.ok,
      true,
      "Demonstra falha anterior sem gravar em banco remoto",
    );
    await db.exec("rollback");
    const migration = await readFile(
      new URL("../supabase/010_work_identity.sql", import.meta.url),
      "utf8",
    );
    await db.exec(migration);
    await db.exec(migration);
    await db.exec("set role authenticated");
    await assert.rejects(save(different, work), /ID da obra inconsistente/);
    assert.equal((await save(work.id, work)).rows[0].result.ok, true);
    await assert.rejects(
      save(work.id, { ...work, id: different }, 1),
      /ID da obra inconsistente/,
    );
    assert.equal(
      (await save(work.id, { ...work, address: "Correção válida" }, 1)).rows[0]
        .result.revision,
      2,
    );
    await db.exec("reset role");
    assert.equal(
      (await db.query("select count(*)::int n from obras")).rows[0].n,
      1,
    );
    assert.equal(
      (await db.query("select payload->>'address' as address from obras"))
        .rows[0].address,
      "Correção válida",
    );
  } finally {
    await db.close();
  }
});
