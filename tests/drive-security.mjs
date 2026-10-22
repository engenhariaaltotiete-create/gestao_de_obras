import test, { after } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { newWork } from "../src/model.ts";

// Compila o handler real com transporte/banco simulados; nenhuma credencial ou rede real.
let context, handler, fetchMock;
const originalFetch = globalThis.fetch;
const originalDeno = globalThis.Deno;
globalThis.fetch = (...args) => fetchMock(...args);
after(() => {
  globalThis.fetch = originalFetch;
  globalThis.Deno = originalDeno;
  delete globalThis.__driveContext;
});
globalThis.Deno = {
  env: { get: () => "test-only" },
  serve: (fn) => {
    handler = fn;
  },
};
const bundled = await build({
  entryPoints: ["supabase/functions/drive-files/index.ts"],
  bundle: true,
  write: false,
  format: "esm",
  platform: "neutral",
  plugins: [
    {
      name: "auth-fixture",
      setup(b) {
        b.onResolve({ filter: /\/auth\.ts$/ }, () => ({
          path: "auth",
          namespace: "fixture",
        }));
        b.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
          contents: `
 export const cors={};
 export const authorize=async()=>globalThis.__driveContext;
 export const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
 export const failure=e=>json({error:String(e)},String(e).includes('403:')?403:400);
 `,
          loader: "js",
        }));
      },
    },
  ],
});
await import(
  "data:text/javascript;base64," +
    Buffer.from(bundled.outputFiles[0].text).toString("base64")
);
const fileId = "00000000-0000-4000-8000-000000000021";
const userId = "00000000-0000-4000-8000-000000000022";
const file = new File(["test"], "arquivo.txt", { type: "text/plain" });

function setup({ linked = true, race = false, role = "admin" } = {}) {
  const work = newWork();
  const entity = work.stages[0];
  entity.note = fileId;
  entity.attachments = linked ? [{ id: fileId }] : [];
  let reserved = null,
    uploads = 0,
    googleCalls = 0,
    options;
  const client = {
    from: (table) => ({
      select() {
        return this;
      },
      eq() {
        return this;
      },
      async single() {
        return {
          data:
            table === "obras"
              ? { id: work.id, payload: work }
              : context.metadata,
          error: null,
        };
      },
    }),
  };
  const privileged = {
    from: () => ({
      op: "read",
      select() {
        return this;
      },
      eq() {
        return this;
      },
      upsert(row, opts) {
        this.op = "reserve";
        options = opts;
        reserved = race
          ? {
              ...row,
              work_id: crypto.randomUUID(),
              uploaded_by: crypto.randomUUID(),
            }
          : row;
        return this;
      },
      update(patch) {
        this.op = "update";
        reserved = { ...reserved, ...patch };
        return this;
      },
      async maybeSingle() {
        return { data: this.op === "read" ? null : reserved, error: null };
      },
      async single() {
        return { data: reserved, error: null };
      },
    }),
  };
  context = {
    user: { id: userId },
    profile: { role, active: true },
    client,
    privileged,
    metadata: {
      id: fileId,
      drive_id: "generated-1",
      status: "uploaded",
      mime: "text/html",
    },
  };
  globalThis.__driveContext = context;
  fetchMock = async (url, init = {}) => {
    googleCalls++;
    if (url === "https://oauth2.googleapis.com/token")
      return Response.json({
        access_token: "fixture",
        token_type: "Bearer",
        expires_in: 3600,
      });
    if (url.includes("/upload/")) {
      uploads++;
      return Response.json({ id: "generated-1" });
    }
    if (url.includes("generateIds"))
      return Response.json({ ids: ["generated-1"] });
    if (url.includes("&q=")) return Response.json({ files: [] });
    if (init.method === "POST") return Response.json({ id: "folder" });
    if (url.includes("alt=media")) return new Response("<html>test</html>");
    if (url.includes("fields=id,size,appProperties"))
      return Response.json({
        id: "generated-1",
        size: 4,
        appProperties: { sgoFileId: fileId },
      });
    return new Response("", { status: 404 });
  };
  return {
    work,
    entity,
    stats: () => ({ uploads, googleCalls, options, reserved }),
  };
}
function upload(work, entity, overrides = {}) {
  const form = new FormData();
  Object.entries({
    id: fileId,
    workId: work.id,
    entityId: entity.id,
    kind: "document",
    ...overrides,
  }).forEach(([k, v]) => form.append(k, v));
  form.append("file", file);
  return new Request("https://fixture/drive-files", {
    method: "POST",
    body: form,
  });
}

test("upload recusa ID presente apenas em observação antes de acessar o Google", async () => {
  const { work, entity, stats } = setup({ linked: false });
  const res = await handler(upload(work, entity));
  assert.equal(res.status, 403);
  assert.match((await res.json()).error, /não vinculado/);
  assert.equal(stats().googleCalls, 0);
});
test("upload válido confirma binário e metadados e reserva sem sobrescrever concorrentes", async () => {
  const { work, entity, stats } = setup();
  const res = await handler(upload(work, entity));
  assert.equal(res.status, 200, await res.clone().text());
  assert.equal((await res.json()).status, "uploaded");
  assert.equal(stats().uploads, 1);
  assert.deepEqual(stats().options, {
    onConflict: "id",
    ignoreDuplicates: true,
  });
});
test("reserva concorrente de outro dono não é substituída nem recebe upload", async () => {
  const { work, entity, stats } = setup({ race: true });
  const res = await handler(upload(work, entity));
  assert.equal(res.status, 403, await res.clone().text());
  assert.equal(stats().uploads, 0);
  assert.notEqual(stats().reserved.uploaded_by, userId);
  assert.equal(stats().options.ignoreDuplicates, true);
});
test("UUID malformado e operação desconhecida são recusados", async () => {
  const { work, entity, stats } = setup();
  const res = await handler(upload(work, entity, { id: "-".repeat(36) }));
  assert.equal(res.status, 400);
  const unknown = await handler(
    new Request("https://fixture/drive-files", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "unknown", id: fileId }),
    }),
  );
  assert.equal(unknown.status, 400);
  assert.equal(stats().googleCalls, 0);
});
test("download conserva bytes, força anexo e impede sniffing de conteúdo", async () => {
  setup();
  const res = await handler(
    new Request("https://fixture/drive-files", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "download", id: fileId }),
    }),
  );
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("Content-Disposition"), "attachment");
  assert.equal(res.headers.get("X-Content-Type-Options"), "nosniff");
  assert.equal(await res.text(), "<html>test</html>");
});
test("exclusão continua exclusiva do administrador", async () => {
  const { stats } = setup({ role: "user" });
  const res = await handler(
    new Request("https://fixture/drive-files", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", id: fileId }),
    }),
  );
  assert.equal(res.status, 403);
  assert.equal(stats().googleCalls, 0);
});
