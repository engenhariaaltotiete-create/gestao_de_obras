import { test, expect } from "@playwright/test";
import { newWork } from "../../src/model.ts";

test.beforeEach(async ({ page }) => {
  await page.route("**/src/main.tsx", (r) =>
    r.fulfill({ contentType: "application/javascript", body: "" }),
  );
  await page.route("**/src/data.ts", (r) =>
    r.fulfill({
      contentType: "application/javascript",
      body: "export const supabase = window.__backend || null;",
    }),
  );
  await page.goto("/");
});

test("leitura pendente do cache não expõe obras após trocar de usuário", async ({
  page,
}) => {
  const work = { ...newWork(), address: "Obra privada da sessão A" };
  const result = await page.evaluate(async (work) => {
    const sync = await import("/src/sync.ts");
    sync.configureSync("session-a");
    await sync.mergeRemote([{ id: work.id, payload: work, revision: 1 }]);
    const reading = sync.cachedWorks();
    sync.configureSync("session-b");
    const oldResult = await reading;
    const currentResult = await sync.cachedWorks();
    sync.configureSync("session-a");
    const preserved = await sync.cachedWorks();
    return { oldResult, currentResult, preserved };
  }, work);
  expect(result.oldResult).toEqual([]);
  expect(result.currentResult).toEqual([]);
  expect(result.preserved.map((w) => w.id)).toEqual([work.id]);
});

test("resolver conflito de uma sessão antiga não grava dados no cache do próximo usuário", async ({
  page,
}) => {
  const work = { ...newWork(), address: "Resposta remota do usuário A" };
  const result = await page.evaluate(async (work) => {
    let resolveRemote;
    window.__backend = {
      auth: { getUser: async () => ({ data: { user: { id: "session-a" } } }) },
      from: () => ({
        select() {
          return this;
        },
        eq() {
          return this;
        },
        single() {
          return new Promise((resolve) => {
            resolveRemote = resolve;
          });
        },
      }),
    };
    const sync = await import("/src/sync.ts");
    sync.configureSync("session-a");
    const accepting = sync.acceptRemote(work.id).then(
      () => null,
      (e) => e.message,
    );
    sync.configureSync("session-b");
    resolveRemote({
      data: { id: work.id, payload: work, revision: 2 },
      error: null,
    });
    const error = await accepting;
    return { error, current: await sync.cachedWorks() };
  }, work);
  expect(result.error).toContain("Sessão alterada");
  expect(result.current).toEqual([]);
});

test("download iniciado por outra sessão não entrega o arquivo ao próximo usuário", async ({
  page,
}) => {
  let finish;
  const gate = new Promise((resolve) => {
    finish = resolve;
  });
  let started;
  const requestStarted = new Promise((resolve) => {
    started = resolve;
  });
  await page.route("**/functions/v1/drive-files", async (route) => {
    started();
    await gate;
    await route.fulfill({
      status: 200,
      contentType: "text/plain",
      body: "arquivo privado da sessão A",
    });
  });
  await page.evaluate(async () => {
    window.__fileOwner = "session-a";
    window.__backend = {
      auth: {
        getSession: async () => ({
          data: {
            session: {
              user: { id: window.__fileOwner },
              access_token: "fixture-token",
            },
          },
        }),
      },
    };
    const files = await import("/src/domains/files.ts");
    window.__download = files
      .getFile("00000000-0000-4000-8000-000000000031")
      .then((blob) => blob.text())
      .then(
        (text) => ({ text }),
        (e) => ({ error: e.message }),
      );
  });
  await requestStarted;
  await page.evaluate(() => {
    window.__fileOwner = "session-b";
  });
  finish();
  const result = await page.evaluate(() => window.__download);
  expect(result.error).toContain("Sessão alterada");
  expect(result.text).toBeUndefined();
});
