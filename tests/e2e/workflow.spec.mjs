import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { newWork, syncStages } from "../../src/model.ts";
function fixture(requester = "Prefeitura", address = "Rua de teste") {
  const work = newWork();
  Object.assign(work, {
    address,
    district: "Centro",
    requester,
    requestDocument: "Ofício 1",
    dataValidated: true,
    links: 12,
    png: 3,
    pavements: [{ type: "Asfalto", length: 120 }],
  });
  work.points = [
    { id: "p1", lat: -23.542, lng: -46.31 },
    { id: "p2", lat: -23.541, lng: -46.309 },
  ];
  work.lines = [{ id: "l1", pointIds: ["p1", "p2"] }];
  work.segments = [
    {
      id: "s1",
      name: "Trecho 1",
      address: "Rua de teste",
      district: "Centro",
      city: "Suzano",
      calculated: 120,
      manual: null,
      status: "AGUARDANDO",
      from: "p1",
      to: "p2",
      lineId: "l1",
    },
  ];
  for (const stage of work.stages) {
    stage.status = "AGUARDANDO";
    stage.start = "2026-10-01";
    stage.end = "2026-11-30";
    stage.responsible = "demo-admin";
  }
  work.stages[6].status = "EM ANDAMENTO";
  work.budget = [
    {
      id: "b1",
      description: "Serviço",
      unit: "m",
      quantity: 120,
      unitPrice: 10,
    },
  ];
  work.startDocs[0].status = "EM ANDAMENTO";
  work.startDocs[0].start = "2026-10-01";
  work.startDocs[0].end = "2026-10-10";
  return syncStages(work);
}
async function login(page, works = [fixture()]) {
  await page.route(
    /https:\/\/(.*tile\.openstreetmap\.org|nominatim\.openstreetmap\.org)\//,
    (r) => r.abort(),
  );
  await page.addInitScript((works) => {
    if (!localStorage.getItem("sgo_works_v1"))
      localStorage.setItem("sgo_works_v1", JSON.stringify(works));
  }, works);
  await page.goto("/");
  await page.locator("input[type=email]").fill("demo@example.com");
  await page.getByRole("button", { name: "Entrar em demonstração" }).click();
  await expect(
    page.getByRole("heading", { name: "Obras", exact: true }),
  ).toBeVisible();
}
async function navigate(page, name) {
  if (await page.locator(".hamburger").isVisible())
    await page.locator(".hamburger").click();
  const label = name === "Dashboard" ? "Dashboard de Obras" : name;
  const group = ["Usuários", "Auditoria"].includes(label)
    ? "ADMINISTRAÇÃO"
    : "OBRAS";
  const toggle = page.locator(".nav-group-toggle").filter({ hasText: group });
  if ((await toggle.getAttribute("aria-expanded")) !== "true")
    await toggle.click();
  await page
    .locator(".nav-group-links")
    .getByRole("button", { name: label, exact: true })
    .click();
}
async function openWork(page) {
  await page.locator(".work-row").first().click();
  await page.getByRole("button", { name: /^CROQUI DA OBRA/ }).click();
  await expect(page.locator(".map-wrap")).toBeVisible();
}
async function filterRequester(page, names) {
  await page.getByRole("button", { name: /^Filtros/ }).click();
  const multi = page
    .locator(".multi")
    .filter({ has: page.locator("label", { hasText: /^Solicitante$/ }) });
  await multi.locator(".multi-trigger").click();
  await multi.locator('input[placeholder="Pesquisar..."]').fill("");
  for (const name of names)
    await multi.getByLabel(name, { exact: true }).check();
  await multi.getByRole("button", { name: "Concluir" }).click();
}
test("filtros combinam solicitantes e município; dashboard e carteira filtram por obra", async ({
  page,
}) => {
  const a = fixture(),
    b = fixture("Sabesp", "Rua B"),
    c = fixture("Outro", "Rua C");
  b.city = "Poá";
  await login(page, [a, b, c]);
  await filterRequester(page, ["Prefeitura", "Sabesp"]);
  await expect(page.locator(".work-row")).toHaveCount(2);
  const city = page
    .locator(".multi")
    .filter({ has: page.locator("label", { hasText: /^Município$/ }) });
  await city.locator(".multi-trigger").click();
  await city.getByLabel("Suzano", { exact: true }).check();
  await city.getByRole("button", { name: "Concluir" }).click();
  await expect(page.locator(".work-row")).toHaveCount(1);
  await navigate(page, "Dashboard");
  // A navegação atual limpa os filtros da tela anterior.
  await expect(
    page.locator(".general-timeline tbody tr:not(.municipality-row)"),
  ).toHaveCount(3);
  const chooseWork = async () => {
    await page.getByRole("button", { name: /^Filtros/ }).click();
    const multi = page
      .locator(".multi")
      .filter({ has: page.locator("label", { hasText: /^Obra$/ }) });
    await multi.locator(".multi-trigger").click();
    await multi.getByLabel("OB-0002", { exact: true }).check();
    await multi.getByRole("button", { name: "Concluir", exact: true }).click();
  };
  await chooseWork();
  await expect(
    page.locator(".general-timeline tbody tr:not(.municipality-row)"),
  ).toHaveCount(1);
  await expect(page.locator(".general-timeline tbody")).toContainText("Rua B");
  await expect(page.locator(".kpi").first()).toContainText("1");
  await navigate(page, "Carteira de Atividades");
  await chooseWork();
  await page.getByRole("button", { name: "Aplicar", exact: true }).click();
  await expect(page.locator(".main")).toContainText("Rua B");
  await expect(page.locator(".main")).not.toContainText("Rua C");
});
test("croqui: consulta, cancelar, salvar, persistir, auditoria e exclusão confirmada", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await login(page);
  await openWork(page);
  await page
    .locator(".segment-list")
    .getByRole("button", { name: "Trecho 1", exact: true })
    .click();
  await expect(page.getByRole("dialog", { name: "Editar trecho" })).toHaveCount(
    0,
  );
  const croqui = page
    .locator("section.accordion")
    .filter({ has: page.getByRole("button", { name: /^CROQUI DA OBRA/ }) });
  await croqui.getByRole("button", { name: "EDITAR", exact: true }).click();
  await page
    .locator(".segment-list")
    .getByRole("button", { name: "Trecho 1", exact: true })
    .click();
  let dialog = page.getByRole("dialog", { name: "Editar trecho" });
  await dialog.getByLabel("Nome", { exact: true }).fill("Descartar");
  await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(page.locator(".segment-list")).not.toContainText("Descartar");
  await page
    .getByRole("button", { name: "Focar nos trechos", exact: true })
    .click();
  await page.locator(".segment-label").first().click();
  dialog = page.getByRole("dialog", { name: "Editar trecho" });
  await dialog.getByLabel("Nome", { exact: true }).fill("Trecho atualizado");
  await dialog.getByLabel("Status", { exact: true }).selectOption("CONCLUÍDO");
  await dialog.getByRole("button", { name: "Salvar", exact: true }).click();
  await croqui.getByRole("button", { name: "Confirmar alterações" }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("sgo_works_v1"))[0].segments[0].name,
      ),
    )
    .toBe("Trecho atualizado");
  const audit = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("sgo_audit_v1")),
  );
  expect(audit).toHaveLength(1);
  expect(audit[0].field).toBe("UPDATE");
  expect(JSON.parse(audit[0].after)).toEqual({
    "segments[s1].name": "Trecho atualizado",
    "segments[s1].status": "CONCLUÍDO",
    "segments[s1].statusAt": expect.any(String),
  });
  expect(
    Number.isFinite(
      Date.parse(JSON.parse(audit[0].after)["segments[s1].statusAt"]),
    ),
  ).toBe(true);
  await page.reload();
  await page.locator("input[type=email]").fill("demo@example.com");
  await page.getByRole("button", { name: "Entrar em demonstração" }).click();
  await openWork(page);
  await expect(page.locator(".segment-list")).toContainText(
    "Trecho atualizado",
  );
  await croqui.getByRole("button", { name: "EDITAR", exact: true }).click();
  await page
    .locator(".segment-list")
    .getByRole("button", { name: "Trecho atualizado", exact: true })
    .click();
  page.once("dialog", (d) => d.dismiss());
  await page
    .getByRole("dialog", { name: "Editar trecho" })
    .getByRole("button", { name: "Excluir", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Editar trecho" }),
  ).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("dialog", { name: "Editar trecho" })
    .getByRole("button", { name: "Excluir", exact: true })
    .click();
  await croqui.getByRole("button", { name: "Confirmar alterações" }).click();
  await expect(page.locator(".segment-list tbody tr")).toHaveCount(0);
  expect(errors).toEqual([]);
});
test("12 etapas, LIG/PNG persiste, checklist e cronograma mantêm documentos", async ({
  page,
}) => {
  await login(page);
  await openWork(page);
  await page.getByRole("button", { name: /^ETAPAS/ }).click();
  const block = page
    .locator("section.accordion")
    .filter({ has: page.getByRole("button", { name: /^ETAPAS/ }) });
  await expect(block.locator("tbody tr")).toHaveCount(12);
  await block.getByRole("button", { name: "EDITAR", exact: true }).click();
  const lig = block.locator("tbody tr").filter({ hasText: "LIG/PNG" });
  await lig.locator("select.status-select").selectOption("EM ANDAMENTO");
  await lig.locator("textarea").fill("Executar ligações");
  await block.getByRole("button", { name: "Confirmar alterações" }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("sgo_works_v1"))[0].stages[7].note,
      ),
    )
    .toBe("Executar ligações");
  await page.getByRole("button", { name: /^CRONOGRAMA DA OBRA/ }).click();
  await expect(page.locator(".timeline-table tbody tr")).toHaveCount(12);
  await page
    .locator(".timeline-table")
    .getByRole("button", { name: /Checklist de Início de Obra/ })
    .click();
  await expect(page.locator(".timeline-table tbody tr")).toHaveCount(31);
  await expect(page.locator(".schedule-identification")).toContainText(
    "Prefeitura",
  );
  await expect(page.locator(".schedule-cards")).toContainText(
    "STATUS DA EXECUÇÃO",
  );
});
for (const width of [360, 390, 768, 1024, 1440])
  test(`responsividade, agrupamento por município e edição em ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await login(page);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const noOverflow = async () =>
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    await noOverflow();
    await navigate(page, "Dashboard");
    await expect(page.locator(".general-timeline thead tr th")).toHaveText([
      "ENDEREÇO",
      "A/E",
      "EXT (M)",
      "LIG.",
      "PNG",
      "% EXEC.",
      "STATUS EXECUÇÃO",
      /HOJE/,
    ]);
    await expect(page.locator(".municipality-row")).toContainText("SUZANO");
    await noOverflow();
    await navigate(page, "Obras");
    await openWork(page);
    await noOverflow();
    if (width <= 850) {
      await expect(page.locator(".leaflet-container")).toHaveClass(
        /page-scroll-map/,
      );
      await page
        .getByRole("button", { name: "NAVEGAR NO MAPA", exact: true })
        .click();
      await expect(page.locator(".leaflet-container")).not.toHaveClass(
        /page-scroll-map/,
      );
      await page
        .getByRole("button", { name: "VOLTAR À ROLAGEM", exact: true })
        .click();
    }
    const croqui = page
      .locator("section.accordion")
      .filter({ has: page.getByRole("button", { name: /^CROQUI DA OBRA/ }) });
    await croqui.getByRole("button", { name: "EDITAR", exact: true }).click();
    await page
      .locator(".segment-list")
      .getByRole("button", { name: "Trecho 1", exact: true })
      .click();
    const dialog = page.getByRole("dialog", { name: "Editar trecho" });
    await expect(dialog).toBeVisible();
    await noOverflow();
    await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
    await croqui.getByRole("button", { name: "Cancelar", exact: true }).click();
    await page.getByRole("button", { name: /^CRONOGRAMA DA OBRA/ }).click();
    await noOverflow();
    for (const cell of await page.locator(".timeline-table thead th").all())
      await expect(cell).toBeVisible();
    if (width === 390)
      await page.screenshot({
        path: "/workspace/gestao_de_obras/test-results/cronograma-390.png",
        fullPage: true,
      });
    expect(errors).toEqual([]);
  });
test("link externo tem proteção e formulário de usuário informa dependência do Supabase", async ({
  page,
}) => {
  await login(page);
  const link = page.getByRole("link", { name: /RELATÓRIOS PADRÃO/ });
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(link).toHaveAttribute("rel", "noopener noreferrer");
  await navigate(page, "Usuários");
  await page.getByLabel("Nome completo").fill("Teste");
  await page.getByLabel("E-mail", { exact: true }).fill("teste@example.com");
  await page.getByRole("button", { name: "Convidar por e-mail" }).click();
  await expect(page.locator("p[role=status]")).toContainText(
    "Supabase configurado",
  );
});

test("mapa: seleção direta, trechos sobrepostos e controle de identificações", async ({
  page,
}) => {
  const work = fixture();
  work.segments.push({
    ...work.segments[0],
    id: "s2",
    name: "Trecho sobreposto",
  });
  await login(page, [work]);
  await openWork(page);
  const croqui = page
    .locator("section.accordion")
    .filter({ has: page.getByRole("button", { name: /^CROQUI DA OBRA/ }) });
  await croqui.getByRole("button", { name: "EDITAR", exact: true }).click();
  await page
    .getByRole("button", { name: "Focar nos trechos", exact: true })
    .click();
  await expect(page.locator(".segment-label")).toHaveCount(1); // Collision suppression.
  await page
    .getByRole("button", { name: "Ocultar identificações", exact: true })
    .click();
  await expect(page.locator(".segment-label")).toHaveCount(0);
  const paths = page.locator(".leaflet-overlay-pane path.leaflet-interactive");
  const box = await paths.last().boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(
    page.getByRole("dialog", { name: "Escolher trecho" }),
  ).toBeVisible();
  await page
    .getByRole("dialog", { name: "Escolher trecho" })
    .getByRole("button", { name: "Trecho sobreposto", exact: true })
    .click();
  await expect(
    page
      .getByRole("dialog", { name: "Editar trecho" })
      .getByLabel("Nome", { exact: true }),
  ).toHaveValue("Trecho sobreposto");
  await page
    .getByRole("dialog", { name: "Editar trecho" })
    .getByRole("button", { name: "Cancelar", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Mostrar identificações", exact: true })
    .click();
  await expect(page.locator(".segment-label")).toHaveCount(1);
});
for (const device of [
  { name: "Android", width: 360, height: 800 },
  { name: "iPhone", width: 390, height: 844 },
])
  test(`toque em ${device.name}: rolagem, desenho e modal`, async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: { width: device.width, height: device.height },
      isMobile: true,
      hasTouch: true,
    });
    try {
      const page = await context.newPage();
      await login(page);
      await openWork(page);
      await expect(page.locator(".leaflet-container")).toHaveClass(
        /page-scroll-map/,
      );
      const croqui = page
        .locator("section.accordion")
        .filter({ has: page.getByRole("button", { name: /^CROQUI DA OBRA/ }) });
      await croqui.getByRole("button", { name: "EDITAR", exact: true }).tap();
      await page.getByRole("button", { name: "Ponto", exact: true }).tap();
      await expect(page.locator(".leaflet-container")).not.toHaveClass(
        /page-scroll-map/,
      );
      await page
        .locator(".toolbar")
        .getByRole("button", { name: "Cancelar", exact: true })
        .tap();
      await expect(page.locator(".leaflet-container")).toHaveClass(
        /page-scroll-map/,
      );
      await page
        .locator(".segment-list")
        .getByRole("button", { name: "Trecho 1", exact: true })
        .tap();
      const dialog = page.getByRole("dialog", { name: "Editar trecho" });
      await expect(dialog).toBeVisible();
      const district = await dialog
          .getByLabel("Bairro", { exact: true })
          .boundingBox(),
        city = await dialog
          .getByLabel("Município", { exact: true })
          .boundingBox();
      expect(Math.abs(district.y - city.y)).toBeLessThan(2);
      const status = await dialog
          .getByLabel("Status", { exact: true })
          .boundingBox(),
        length = await dialog
          .locator(".segment-field-length input")
          .boundingBox();
      expect(status.y).toBeLessThan(length.y);
      expect(status.width).toBeGreaterThan(city.width);
      for (const button of await dialog.locator("button").all())
        expect((await button.boundingBox()).height).toBeGreaterThanOrEqual(44);
      await dialog.getByRole("button", { name: "Cancelar", exact: true }).tap();
    } finally {
      await context.close();
    }
  });

test("cadastro obrigatório, orçamento e relatório fotográfico preservam o fluxo local", async ({
  page,
}) => {
  await login(page, []);
  await page.getByRole("button", { name: "Nova Obra", exact: true }).click();
  const modal = page.getByRole("dialog", { name: "Cadastrar nova obra" });
  await modal.getByRole("button", { name: "Criar obra", exact: true }).click();
  await expect(modal.locator(".error")).toContainText("Endereço é obrigatório");
  await modal.getByLabel("Endereço", { exact: true }).fill("Rua cadastrada");
  await modal.getByLabel("Bairro", { exact: true }).fill("Centro");
  await modal.getByLabel("Solicitante", { exact: true }).fill("Prefeitura");
  await modal
    .getByLabel("Documento de solicitação", { exact: true })
    .fill("Ofício de teste");
  await modal.getByLabel("Asfalto", { exact: true }).check();
  await modal.getByRole("button", { name: "Criar obra", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Rua cadastrada", exact: true }),
  ).toBeVisible();
  const works = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("sgo_works_v1")),
  );
  expect(works).toHaveLength(1);
  expect(works[0].stages).toHaveLength(12);
  expect(works[0].dataValidated).toBe(true);
  await page.getByRole("button", { name: /^ORÇAMENTO DA OBRA/ }).click();
  const budget = page
    .locator("section.accordion")
    .filter({ has: page.getByRole("button", { name: /^ORÇAMENTO DA OBRA/ }) });
  await budget.getByRole("button", { name: "EDITAR", exact: true }).click();
  await budget.getByRole("button", { name: /Adicionar/ }).click();
  await budget.locator("input[list=price-catalog]").fill("Serviço de teste");
  await budget.locator("input[type=number]").fill("2");
  await budget.getByRole("button", { name: "Confirmar alterações" }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () => JSON.parse(localStorage.getItem("sgo_works_v1"))[0].budget.length,
      ),
    )
    .toBe(1);
  await page.getByRole("button", { name: /^RELATÓRIOS FOTOGRÁFICOS/ }).click();
  await page
    .getByRole("button", { name: "Novo relatório", exact: true })
    .click();
  const report = page.getByRole("dialog", { name: "Relatório fotográfico" });
  await expect(report).toBeVisible();
  await report
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: "foto-teste.jpg",
      mimeType: "image/jpeg",
      buffer: await readFile(
        new URL("../../src/reference/assets/sabesp-logo.jpg", import.meta.url),
      ),
    });
  await expect(report.locator(".file-card img")).toBeVisible();
  await report.getByLabel(/^Título/).fill("Foto de teste");
  await report
    .getByRole("button", { name: "Salvar rascunho", exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("sgo_works_v1"))[0].reports.length,
      ),
    )
    .toBe(1);
  await report
    .getByRole("button", { name: "Fechar janela", exact: true })
    .click();
  await expect(page.locator(".report-card")).toHaveCount(1);
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Disponibilizar PDF", exact: true })
    .click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.pdf$/);
  const bytes = await readFile(await download.path());
  expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
  expect(bytes.length).toBeGreaterThan(1000);
});

test("cards azuis filtram diretamente pelo status da execução", async ({
  page,
}) => {
  const a = fixture(),
    b = fixture("Outro", "Concluída");
  b.stages[6].status = "CONCLUÍDO";
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, [a, b]);
  const card = page
    .locator(".kpis.five")
    .getByRole("button", { name: /Concluídas/ });
  const color = await card.evaluate(
    (el) => getComputedStyle(el).backgroundColor,
  );
  await card.click();
  await expect(page.locator(".work-row")).toHaveCount(1);
  await expect(page.locator(".work-row")).toContainText("Concluída");
  expect(
    await card.evaluate((el) => getComputedStyle(el).backgroundColor),
  ).toBe(color);
  await expect(card.locator("svg")).toBeVisible();
});

test("consulta não permite dividir trechos após encerrar a edição do croqui", async ({
  page,
}) => {
  await login(page);
  await openWork(page);
  const croqui = page
    .locator("section.accordion")
    .filter({ has: page.getByRole("button", { name: /^CROQUI DA OBRA/ }) });
  await croqui.getByRole("button", { name: "EDITAR", exact: true }).click();
  await page
    .getByRole("button", { name: "Dividir trecho", exact: true })
    .click();
  await croqui
    .getByRole("button", { name: "Confirmar alterações", exact: true })
    .click();
  await expect(
    croqui.getByRole("button", { name: "EDITAR", exact: true }),
  ).toBeVisible();
  const path = page
    .locator(".leaflet-overlay-pane path.leaflet-interactive")
    .last();
  const box = await path.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.locator(".segment-list tbody tr")).toHaveCount(1);
  await expect(
    croqui.getByRole("button", { name: "EDITAR", exact: true }),
  ).toBeVisible();
});
