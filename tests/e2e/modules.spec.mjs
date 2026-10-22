import { test, expect } from "@playwright/test";

function record(status = "LIBERADO") {
  return {
    id: crypto.randomUUID(),
    createdAt: "2026-10-01T12:00:00Z",
    address: "[TESTE] Origem com curva",
    district: "Centro",
    city: "Suzano",
    requester: "Prefeitura",
    requestDocument: "TESTE-01",
    priority: "Alta",
    notes: "Origem para testar cópia sem perder geometria",
    ae: "Água",
    status,
    statusAt: "2026-10-01",
    plannedStart: "2026-10-20",
    plannedEnd: "2026-11-05",
    points: [
      { id: "p1", lat: -23.542, lng: -46.31 },
      { id: "p2", lat: -23.54, lng: -46.309 },
      { id: "p3", lat: -23.542, lng: -46.308 },
    ],
    lines: [{ id: "linha1", pointIds: ["p1", "p2", "p3"] }],
    segments: [
      {
        id: "trecho1",
        name: "Trecho curvo",
        address: "[TESTE] Origem com curva",
        district: "Centro",
        city: "Suzano",
        calculated: 450,
        manual: null,
        status: "AGUARDANDO",
        from: "p1",
        to: "p3",
        lineId: "linha1",
      },
    ],
  };
}
const modules = [
  {
    label: "Diagnósticos",
    group: "DIAGNÓSTICO",
    dashboard: "Dashboard de Diagnósticos",
    key: "sgo_diagnostics_v1",
    newButton: "+ Novo diagnóstico",
    create: "Cadastrar diagnóstico",
    del: "Excluir diagnóstico",
  },
  {
    label: "Topografias",
    group: "TOPOGRAFIA",
    dashboard: "Dashboard de Topografias",
    key: "sgo_topographies_v1",
    newButton: "+ Nova topografia",
    create: "Cadastrar topografia",
    del: "Excluir topografia",
  },
];
async function login(page, mod, records) {
  await page.route(
    /https:\/\/(.*tile\.openstreetmap\.org|nominatim\.openstreetmap\.org)\//,
    (r) => r.abort(),
  );
  await page.addInitScript(
    ({ key, records }) => {
      localStorage.setItem("sgo_works_v1", "[]");
      localStorage.setItem("sgo_diagnostics_v1", "[]");
      localStorage.setItem("sgo_topographies_v1", "[]");
      localStorage.setItem(key, JSON.stringify(records));
    },
    { key: mod.key, records },
  );
  await page.goto("/");
  await page.locator("input[type=email]").fill("demo@example.com");
  await page
    .getByRole("button", { name: "Entrar em demonstração", exact: true })
    .click();
  await page
    .locator(".nav-group-toggle")
    .filter({ hasText: mod.group })
    .click();
  await nav(page, mod.label);
}
const nav = (page, name) =>
  page
    .locator(".nav-group-links")
    .getByRole("button", { name, exact: true })
    .click();
for (const mod of modules) {
  test(`${mod.label}: dashboard deve excluir cancelados ao alternar da lista`, async ({
    page,
  }) => {
    const active = record(),
      cancelled = { ...record("CANCELADO"), address: "[TESTE] Cancelado" };
    await login(page, mod, [active, cancelled]);
    await expect(page.locator(".diagnostic-table tbody tr")).toHaveCount(2);
    await nav(page, mod.dashboard);
    await expect(page.locator(".program-data-row")).toHaveCount(1);
    await nav(page, mod.label);
    await expect(page.locator(".diagnostic-table tbody tr")).toHaveCount(2);
  });
  test(`${mod.label}: pesquisa do dashboard mantém indicadores e tabela consistentes`, async ({
    page,
  }) => {
    await login(page, mod, [record()]);
    await nav(page, mod.dashboard);
    await page
      .getByRole("textbox", { name: "Pesquisar por endereço", exact: true })
      .fill("Prefeitura");
    await expect(page.locator(".program-data-row")).toHaveCount(0);
    await expect(page.locator(".diagnostic-kpi strong").first()).toHaveText(
      "0",
    );
  });
  test(`${mod.label}: cadastro, validação de datas, edição e exclusão`, async ({
    page,
  }) => {
    await login(page, mod, []);
    await page
      .getByRole("button", { name: mod.newButton, exact: true })
      .click();
    const modal = page.locator(".diagnostic-modal-content");
    await modal.getByRole("button", { name: mod.create, exact: true }).click();
    await expect(page.locator(".error-banner")).toContainText(
      "Informe o endereço",
    );
    await modal
      .getByLabel("Endereço", { exact: true })
      .fill("[TESTE] Cadastro funcional");
    await modal.getByRole("button", { name: mod.create, exact: true }).click();
    await expect(page.locator(".diagnostic-table tbody tr")).toHaveCount(1);
    await page
      .getByRole("button", { name: "Editar programação", exact: true })
      .click();
    await modal
      .getByLabel("Previsão de início", { exact: true })
      .fill("2026-11-05");
    await modal
      .getByLabel("Previsão de término", { exact: true })
      .fill("2026-11-01");
    await modal.getByRole("button", { name: "Salvar", exact: true }).click();
    await expect(page.locator(".error-banner")).toContainText(
      "término não pode ser anterior",
    );
    await expect(modal).toBeVisible();
    await modal
      .getByLabel("Previsão de término", { exact: true })
      .fill("2026-11-10");
    await modal
      .getByRole("combobox", { name: "Status", exact: true })
      .selectOption("EM EXECUÇÃO");
    await modal.getByRole("button", { name: "Salvar", exact: true }).click();
    await expect(page.locator(".diagnostic-table tbody tr")).toContainText(
      "EM EXECUÇÃO",
    );
    const saved = await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)),
      mod.key,
    );
    expect(saved[0].plannedEnd).toBe("2026-11-10");
    await page
      .locator(".diagnostic-table tbody tr")
      .filter({ hasText: "[TESTE] Cadastro funcional" })
      .click();
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: mod.del, exact: true }).click();
    await expect(page.locator(".diagnostic-table tbody tr")).toHaveCount(0);
  });
  test(`${mod.label}: gerar obra deve preservar pontos intermediários do croqui`, async ({
    page,
  }) => {
    const source = record();
    await login(page, mod, [source]);
    await page
      .locator(".diagnostic-table tbody tr")
      .filter({ hasText: source.address })
      .click();
    await page.getByRole("button", { name: "Gerar Obra", exact: true }).click();
    await page
      .getByRole("button", { name: "Continuar para nova obra", exact: true })
      .click();
    const modal = page.getByRole("dialog", { name: "Cadastrar nova obra" });
    await expect(modal).toBeVisible();
    await modal.getByLabel("Asfalto", { exact: true }).check();
    await modal
      .getByRole("button", { name: "Criar obra", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: source.address, exact: true }),
    ).toBeVisible();
    const saved = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("sgo_works_v1")),
    );
    expect(saved).toHaveLength(1);
    expect(
      saved[0][
        mod.label === "Diagnósticos"
          ? "originDiagnosticId"
          : "originTopographyId"
      ],
    ).toBe(source.id);
    expect(saved[0].points).toEqual(source.points);
    expect(saved[0].lines).toEqual(source.lines);
  });
  test(`${mod.label}: gerar obra com seleção parcial preserva a curva sem copiar outro trecho`, async ({
    page,
  }) => {
    const source = record();
    source.points.push(
      { id: "p4", lat: -23.55, lng: -46.32 },
      { id: "p5", lat: -23.551, lng: -46.321 },
    );
    source.lines.push({ id: "linha2", pointIds: ["p4", "p5"] });
    source.segments.push({
      ...source.segments[0],
      id: "trecho2",
      name: "Outro trecho",
      from: "p4",
      to: "p5",
      lineId: "linha2",
    });
    await login(page, mod, [source]);
    await page
      .locator(".diagnostic-table tbody tr")
      .filter({ hasText: source.address })
      .click();
    await page.getByRole("button", { name: "Gerar Obra", exact: true }).click();
    await page.getByLabel("Trechos selecionados", { exact: true }).check();
    await page.getByLabel(/Outro trecho/).uncheck();
    await page
      .getByRole("button", { name: "Continuar para nova obra", exact: true })
      .click();
    const modal = page.getByRole("dialog", { name: "Cadastrar nova obra" });
    await modal.getByLabel("Asfalto", { exact: true }).check();
    await modal
      .getByRole("button", { name: "Criar obra", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: source.address, exact: true }),
    ).toBeVisible();
    const saved = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("sgo_works_v1")),
    );
    expect(saved[0].points).toEqual(source.points.slice(0, 3));
    expect(saved[0].lines).toEqual([source.lines[0]]);
    expect(saved[0].segments).toEqual([source.segments[0]]);
    const originals = await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)),
      mod.key,
    );
    expect(originals).toEqual([source]);
  });
}

test("Diagnóstico → Topografia preserva o croqui e o vínculo de origem", async ({
  page,
}) => {
  const source = record();
  await login(page, modules[0], [source]);
  await page
    .locator(".diagnostic-table tbody tr")
    .filter({ hasText: source.address })
    .click();
  await page
    .getByRole("button", { name: "Gerar Topografia", exact: true })
    .click();
  page.once("dialog", (d) => d.accept());
  await page
    .locator(".diagnostic-modal-content")
    .getByRole("button", { name: "Gerar Topografia", exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(
        () => JSON.parse(localStorage.getItem("sgo_topographies_v1")).length,
      ),
    )
    .toBe(1);
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("sgo_topographies_v1")),
  );
  expect(saved[0].originDiagnosticId).toBe(source.id);
  expect(saved[0].points).toEqual(source.points);
  expect(saved[0].lines).toEqual(source.lines);
});
