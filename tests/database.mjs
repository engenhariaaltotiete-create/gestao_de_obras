import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { newWork } from "../src/model.ts";

test("PostgreSQL local: migrations, revisão, RLS, auditoria agrupada e administração protegida", async () => {
  const db = new PGlite();
  const admin = "00000000-0000-4000-8000-000000000001",
    user = "00000000-0000-4000-8000-000000000002";
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
 create schema auth; create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb);
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
    ])
      await db.exec(
        await readFile(new URL("../supabase/" + name, import.meta.url), "utf8"),
      );
    await db.exec(
      `grant select,insert,update,delete on all tables in schema public to authenticated,service_role;`,
    );
    await db.query("insert into auth.users values ($1,$2,$3),($4,$5,$6)", [
      admin,
      "admin@example.com",
      "{}",
      user,
      "user@example.com",
      "{}",
    ]);
    await db.query("update profiles set role='admin' where id=$1", [admin]);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      admin,
    ]);
    await db.exec("set role authenticated");
    const w = newWork();
    w.stages[7].status = "EM ANDAMENTO";
    w.stages[7].note = "Ligações";
    w.stages[7].responsible = user;
    const save = async (payload, revision) =>
      (
        await db.query(
          "select save_work_if_revision($1,$2,$3::jsonb,$4) as result",
          [w.id, w.createdAt, JSON.stringify(payload), revision],
        )
      ).rows[0].result;
    assert.equal((await save(w, null)).ok, true);
    const edited = structuredClone(w);
    edited.address = "Rua de teste";
    edited.stages[7].note = "PNG";
    assert.equal((await save(edited, 1)).revision, 2);
    let audit = (await db.query("select * from audit_log where field='UPDATE'"))
      .rows;
    assert.equal(audit.length, 1);
    assert.deepEqual(
      Object.keys(audit[0].new_value).sort(),
      ["address", `stages[${w.stages[7].id}].note`].sort(),
    );
    assert.equal(audit[0].actor_id, admin);
    assert.equal((await save(edited, 2)).ok, true);
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from audit_log where field='UPDATE'",
        )
      ).rows[0].n,
      1,
    );
    assert.equal((await save(w, 1)).ok, false);
    await db.query("update profiles set role='admin' where id=$1", [user]);
    assert.equal(
      (await db.query("select role from profiles where id=$1", [user])).rows[0]
        .role,
      "user",
    );
    await assert.rejects(
      db.query("select admin_update_profile($1,$2,$3,$4,$5)", [
        user,
        "Promovido",
        "admin",
        true,
        user,
      ]),
      /permission denied/i,
    );
    await assert.rejects(
      db.query("insert into audit_log(entity,field) values ('fake','fake')"),
      /row-level security/i,
    );
    const malformed = structuredClone(edited);
    malformed.stages.splice(7, 1);
    await assert.rejects(save(malformed, 3), /estrutura/);
    await db.exec("reset role");
    await db.exec("set role service_role");
    await db.query("select admin_update_profile($1,$2,$3,$4,$5)", [
      user,
      "Nome novo",
      "user",
      true,
      admin,
    ]);
    const profileAudit = (
      await db.query(
        "select new_value from audit_log where field='ADMIN_UPDATE'",
      )
    ).rows;
    assert.equal(profileAudit.length, 1);
    assert.deepEqual(profileAudit[0].new_value, { name: "Nome novo" });
    await db.query("select admin_update_profile($1,$2,$3,$4,$5)", [
      user,
      "Nome novo",
      "user",
      true,
      admin,
    ]);
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from audit_log where field='ADMIN_UPDATE'",
        )
      ).rows[0].n,
      1,
    );
    await assert.rejects(
      db.query("select admin_update_profile($1,$2,$3,$4,$5)", [
        admin,
        "Admin",
        "user",
        false,
        admin,
      ]),
      /preserve/,
    );
    await db.query("select admin_audit_invitation($1,$2)", [user, admin]);
    const creation = (
      await db.query(
        "select * from audit_log where entity='profiles' and field='CREATE'",
      )
    ).rows;
    assert.equal(creation.length, 1);
    assert.equal(creation[0].actor_id, admin);
    const fileId = "00000000-0000-4000-8000-000000000003";
    await db.query(
      "insert into drive_files(id,work_id,entity_id,kind,name,mime,size,uploaded_by) values($1,$2,$3,'document','teste.txt','text/plain',5,$4)",
      [fileId, w.id, w.id, admin],
    );
    await db.query(
      "update drive_files set status='uploaded',drive_id='test-drive-id',updated_by=$2 where id=$1",
      [fileId, admin],
    );
    const fileAudit = (
      await db.query(
        "select new_value from audit_log where entity='drive_files' and field='UPDATE'",
      )
    ).rows;
    assert.equal(fileAudit.length, 1);
    assert.deepEqual(Object.keys(fileAudit[0].new_value).sort(), [
      "drive_id",
      "status",
      "updated_by",
    ]);
    await db.query("update drive_files set status='uploaded' where id=$1", [
      fileId,
    ]);
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from audit_log where entity='drive_files' and field='UPDATE'",
        )
      ).rows[0].n,
      1,
    );
    await db.query("select admin_update_profile($1,$2,$3,$4,$5)", [
      user,
      "Nome novo",
      "user",
      false,
      admin,
    ]);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      user,
    ]);
    await db.exec("set role authenticated");
    assert.equal((await db.query("select * from obras")).rows.length, 0);
    await assert.rejects(save(edited, 3), /permission denied/);
    assert.equal((await db.query("select * from profiles")).rows.length, 1);
  } finally {
    await db.close();
  }
});
