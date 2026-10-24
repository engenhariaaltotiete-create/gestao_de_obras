import { test, expect } from "@playwright/test";
import { newWork, syncStages } from "../../src/model.ts";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { PDFDocument } from "pdf-lib";

function work(address = "EXPORT-OBRA") {
  const w = newWork();
  Object.assign(w, {
    address,
    district: "Centro",
    city: "Suzano",
    requester: "Prefeitura",
    requestDocument: "EXPORT-01",
    dataValidated: true,
    links: 12,
    pavements: [{ type: "Asfalto", length: 125.5 }],
    createdAt: "2026-10-01T10:00:00.000Z",
    notes: '=HYPERLINK("https://example.invalid";"texto")',
    __revision: 7,
  });
  w.points = [
    { id: "p1", lat: -23.54, lng: -46.31 },
    { id: "p2", lat: -23.541, lng: -46.312 },
  ];
  w.lines = [{ id: "l1", pointIds: ["p1", "p2"] }];
  w.segments = [
    {
      id: "s1",
      name: "Trecho exportado",
      address,
      calculated: 125.5,
      manual: null,
      status: "AGUARDANDO",
      from: "p1",
      to: "p2",
      lineId: "l1",
    },
  ];
  w.budget = [
    {
      id: "b1",
      description: "Serviço exportado",
      unit: "m",
      quantity: 125.5,
      unitPrice: 10,
    },
  ];
  for (const items of [w.stages, w.startDocs, w.endDocs])
    for (const item of items) {
      item.statusAt = "2026-10-01T10:00:00.000Z";
      item.status = "AGUARDANDO";
    }
  w.reports = [
    {
      id: "r1",
      title: "FOTO_PRIVADA_NAO_EXPORTAR_NO_PDF",
      date: "2026-10-01",
      photos: [
        {
          id: "f1",
          caption: "Legenda permitida no Excel",
          data: "data:image/jpeg;base64,BINARIO_PRIVADO_NAO_EXPORTAR",
        },
      ],
    },
  ];
  return syncStages(w);
}
function origin(address, status = "LIBERADO") {
  const w = work(address);
  return {
    id: crypto.randomUUID(),
    address,
    createdAt: w.createdAt,
    district: "Centro",
    city: "Suzano",
    requester: "Prefeitura",
    requestDocument: "EXPORT-ORIGEM",
    priority: "Alta",
    notes: "Dados do diagnóstico/topografia",
    ae: "Esgoto",
    status,
    statusAt: "2026-10-01",
    plannedStart: "2026-10-20",
    plannedEnd: "2026-11-05",
    points: w.points,
    lines: w.lines,
    segments: w.segments,
  };
}
async function login(
  page,
  { works = [], diagnostics = [], topographies = [] } = {},
) {
  await page.route(
    /https:\/\/(.*tile\.openstreetmap\.org|nominatim\.openstreetmap\.org)\//,
    (r) => r.abort(),
  );
  await page.addInitScript(
    (data) => {
      localStorage.setItem("sgo_works_v1", JSON.stringify(data.works));
      localStorage.setItem(
        "sgo_diagnostics_v1",
        JSON.stringify(data.diagnostics),
      );
      localStorage.setItem(
        "sgo_topographies_v1",
        JSON.stringify(data.topographies),
      );
    },
    { works, diagnostics, topographies },
  );
  await page.goto("/");
  await page.locator("input[type=email]").fill("demo@example.com");
  await page
    .getByRole("button", { name: "Entrar em demonstração", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Obras", exact: true }),
  ).toBeVisible();
}
async function download(page, action) {
  const pending = page.waitForEvent("download");
  await action();
  const file = await pending;
  return {
    file,
    bytes: await readFile(await file.path()),
    path: await file.path(),
  };
}
async function workbook(page, bytes) {
  return page.evaluate((xml) => {
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    if (doc.querySelector("parsererror"))
      throw new Error(doc.querySelector("parsererror").textContent);
    const ns = "urn:schemas-microsoft-com:office:spreadsheet";
    return [...doc.getElementsByTagNameNS(ns, "Worksheet")].map((sheet) => ({
      name: sheet.getAttributeNS(ns, "Name"),
      rows: [...sheet.getElementsByTagNameNS(ns, "Row")].map((row) =>
        [...row.getElementsByTagNameNS(ns, "Cell")].map((cell) => {
          const data = cell.getElementsByTagNameNS(ns, "Data")[0];
          return {
            value: data.textContent,
            type: data.getAttributeNS(ns, "Type"),
            formula: cell.getAttributeNS(ns, "Formula"),
          };
        }),
      ),
    }));
  }, bytes.toString("utf8"));
}
async function pdf(page, result) {
  const doc = await PDFDocument.load(result.bytes);
  const text = execFileSync("pdftotext", ["-layout", result.path, "-"], {
    encoding: "utf8",
  });
  const bbox = execFileSync("pdftotext", ["-bbox", result.path, "-"], {
    encoding: "utf8",
  });
  const words = await page.evaluate((xml) => {
    const d = new DOMParser().parseFromString(xml, "application/xml");
    return [...d.getElementsByTagName("word")].map((w) => ({
      text: w.textContent,
      x: Number(w.getAttribute("xMin")),
      right: Number(w.getAttribute("xMax")),
      y: Number(w.getAttribute("yMin")),
      bottom: Number(w.getAttribute("yMax")),
    }));
  }, bbox);
  return {
    text,
    words,
    pages: doc.getPageCount(),
    sizes: doc.getPages().map((p) => p.getSize()),
  };
}

test("Obras: Excel exporta todos os filtrados além das 50 linhas visíveis e todas as abas sem binários", async ({
  page,
}) => {
  const selected = Array.from({ length: 55 }, (_, i) =>
    work("EXPORT-SELECIONADA-" + i),
  );
  selected[0].address += ' <&"';
  const other = work("OUTRA-OBRA");
  let pdfLoads = 0;
  page.on("request", (r) => {
    if (/jspdf/i.test(r.url())) pdfLoads++;
  });
  await login(page, { works: [...selected, other] });
  const before = await page.evaluate(() =>
    localStorage.getItem("sgo_works_v1"),
  );
  await page.locator(".searchbox input").fill("EXPORT-SELECIONADA-");
  await expect(page.locator(".work-row")).toHaveCount(50);
  const result = await download(page, () =>
    page
      .getByRole("button", { name: "Exportar Excel (.xls)", exact: true })
      .click(),
  );
  expect(result.file.suggestedFilename()).toMatch(/\.xls$/);
  const sheets = await workbook(page, result.bytes);
  const general = sheets.find((s) => s.name === "Dados gerais");
  expect(general.rows).toHaveLength(56);
  const address = general.rows[0].findIndex((c) => c.value === "Endereço");
  expect(general.rows.slice(1).map((r) => r[address].value)).not.toContain(
    other.address,
  );
  expect(sheets.map((s) => s.name)).toEqual(
    expect.arrayContaining([
      "Pontos do croqui",
      "Linhas do croqui",
      "Trechos do croqui",
      "Pavimentos",
      "Etapas",
      "Checklist de início",
      "Checklist de conclusão",
      "Orçamento",
      "Relatórios fotográficos",
    ]),
  );
  expect(result.bytes.toString()).not.toContain("BINARIO_PRIVADO_NAO_EXPORTAR");
  expect(result.bytes.toString()).not.toContain("__revision");
  const noteIndex = general.rows[0].findIndex((c) => c.value === "Observações");
  expect(general.rows[1][noteIndex]).toMatchObject({
    type: "String",
    formula: null,
  });
  expect(general.rows[1][noteIndex].value).toContain("=HYPERLINK");
  const all = await download(page, () =>
    page
      .getByRole("button", { name: "Exportar todas (.xls)", exact: true })
      .click(),
  );
  expect(
    (await workbook(page, all.bytes)).find((s) => s.name === "Dados gerais")
      .rows,
  ).toHaveLength(57);
  expect(await page.evaluate(() => localStorage.getItem("sgo_works_v1"))).toBe(
    before,
  );
  expect(pdfLoads).toBe(0);
});

for (const module of [
  {
    name: "Diagnósticos",
    group: "DIAGNÓSTICO",
    key: "diagnostics",
    kind: "Diagnóstico",
  },
  {
    name: "Topografias",
    group: "TOPOGRAFIA",
    key: "topographies",
    kind: "Topografia",
  },
]) {
  test(`${module.name}: exportações filtrada/total e PDF de detalhes mantêm cadastro e vínculos`, async ({
    page,
  }) => {
    const a = origin("EXPORT-ORIGEM-A"),
      b = origin("EXPORT-ORIGEM-B", "CANCELADO");
    const linked = work("OBRA-VINCULADA");
    const topo = origin("TOPOGRAFIA-VINCULADA");
    if (module.key === "diagnostics") {
      linked.originDiagnosticId = a.id;
      topo.originDiagnosticId = a.id;
    } else linked.originTopographyId = a.id;
    await login(page, {
      works: [linked],
      diagnostics: module.key === "diagnostics" ? [a, b] : [],
      topographies: module.key === "topographies" ? [a, b] : [topo],
    });
    const before = await page.evaluate(() => ({
      works: localStorage.getItem("sgo_works_v1"),
      diag: localStorage.getItem("sgo_diagnostics_v1"),
      topo: localStorage.getItem("sgo_topographies_v1"),
    }));
    await page
      .locator(".nav-group-toggle")
      .filter({ hasText: module.group })
      .click();
    await page
      .locator(".nav-group-links")
      .getByRole("button", { name: module.name, exact: true })
      .click();
    await page
      .getByRole("textbox", {
        name: "Pesquisar " + module.name.toLocaleLowerCase("pt-BR"),
        exact: true,
      })
      .fill("EXPORT-ORIGEM-A");
    await expect(page.locator(".diagnostic-table tbody tr")).toHaveCount(1);
    const filtered = await download(page, () =>
      page
        .getByRole("button", { name: "Exportar Excel (.xls)", exact: true })
        .click(),
    );
    expect((await workbook(page, filtered.bytes))[0].rows).toHaveLength(2);
    const all = await download(page, () =>
      page
        .getByRole("button", { name: "Exportar todas (.xls)", exact: true })
        .click(),
    );
    expect((await workbook(page, all.bytes))[0].rows).toHaveLength(3);
    await page.locator(".diagnostic-table tbody tr").first().click();
    const result = await download(page, () =>
      page
        .getByRole("button", { name: "Gerar relatório PDF", exact: true })
        .click(),
    );
    const parsed = await pdf(page, result);
    expect(parsed.text).toContain("EXPORT-ORIGEM-A");
    expect(parsed.text).toContain("OBRA-VINCULADA");
    if (module.key === "diagnostics")
      expect(parsed.text).toContain("TOPOGRAFIA-VINCULADA");
    expect(parsed.text).toContain("Emitido em:");
    expect(parsed.text.match(/Página\s+\d+\s+de\s+\d+/g)).toHaveLength(
      parsed.pages,
    );
    expect(
      await page.evaluate(() => ({
        works: localStorage.getItem("sgo_works_v1"),
        diag: localStorage.getItem("sgo_diagnostics_v1"),
        topo: localStorage.getItem("sgo_topographies_v1"),
      })),
    ).toEqual(before);
  });
}

test("PDF de Obra pagina observações extensas, mantém A4/margens e exclui fotografias", async ({
  page,
}) => {
  const w = work("EXPORT-LONGA");
  w.notes = Array.from(
    { length: 600 },
    (_, i) => "PAGTOKEN_" + String(i).padStart(4, "0"),
  ).join(" ");
  await login(page, { works: [w] });
  const before = await page.evaluate(() =>
    localStorage.getItem("sgo_works_v1"),
  );
  await page.locator(".work-row").first().click();
  page.once("dialog", (d) => d.accept(""));
  const result = await download(page, () =>
    page
      .getByRole("button", { name: "Gerar relatório PDF", exact: true })
      .click(),
  );
  const parsed = await pdf(page, result);
  expect(parsed.pages).toBeGreaterThan(1);
  for (const size of parsed.sizes) {
    expect(size.width).toBeCloseTo(595.28, 1);
    expect(size.height).toBeCloseTo(841.89, 1);
  }
  const tokens = parsed.words.filter((w) => w.text.startsWith("PAGTOKEN_"));
  expect(tokens).toHaveLength(600);
  expect(tokens.some((w) => w.text === "PAGTOKEN_0599")).toBe(true);
  for (const token of tokens) {
    expect(token.y).toBeGreaterThanOrEqual((30 * 72) / 25.4 - 1);
    expect(token.bottom).toBeLessThanOrEqual((267 * 72) / 25.4 + 1);
    expect(token.x).toBeGreaterThanOrEqual((15 * 72) / 25.4 - 1);
    expect(token.right).toBeLessThanOrEqual((195 * 72) / 25.4 + 1);
  }
  expect(
    parsed.words.some(
      (w) => w.text === "48" && Math.abs(w.x - (83 * 72) / 25.4) < 1,
    ),
  ).toBe(true);
  expect(parsed.text).not.toContain("FOTO_PRIVADA_NAO_EXPORTAR_NO_PDF");
  expect(parsed.text).not.toContain("BINARIO_PRIVADO_NAO_EXPORTAR");
  expect(parsed.text).toContain("LIG/PNG");
  expect(parsed.text).toContain("CHECKLIST DE CONCLUSÃO");
  expect(parsed.text.match(/Página\s+\d+\s+de\s+\d+/g)).toHaveLength(
    parsed.pages,
  );
  expect(await page.evaluate(() => localStorage.getItem("sgo_works_v1"))).toBe(
    before,
  );
});

test("população informada vale somente no PDF; cancelar e valores fora do limite não exportam", async ({
  page,
}) => {
  await login(page, { works: [work()] });
  await page.locator(".work-row").first().click();
  const before = await page.evaluate(() =>
    localStorage.getItem("sgo_works_v1"),
  );
  page.once("dialog", (d) => d.accept("12345"));
  const result = await download(page, () =>
    page
      .getByRole("button", { name: "Gerar relatório PDF", exact: true })
      .click(),
  );
  const parsed = await pdf(page, result);
  expect(parsed.words.some((w) => w.text === "12345")).toBe(true);
  let downloads = 0;
  page.on("download", () => downloads++);
  page.once("dialog", (d) => d.dismiss());
  await page
    .getByRole("button", { name: "Gerar relatório PDF", exact: true })
    .click();
  expect(downloads).toBe(0);
  const alerts = [];
  const dialogs = async (d) => {
    if (d.type() === "prompt") await d.accept("9".repeat(400));
    else {
      alerts.push(d.message());
      await d.dismiss();
    }
  };
  page.on("dialog", dialogs);
  await page
    .getByRole("button", { name: "Gerar relatório PDF", exact: true })
    .click();
  await expect.poll(() => alerts.length).toBe(1);
  expect(alerts[0]).toContain("inteiro não negativo");
  expect(downloads).toBe(0);
  page.off("dialog", dialogs);
  expect(await page.evaluate(() => localStorage.getItem("sgo_works_v1"))).toBe(
    before,
  );
});

test("exportações vazias avisam sem baixar arquivo e botões não causam overflow no celular", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await login(page);
  const messages = [];
  page.on("dialog", async (d) => {
    messages.push(d.message());
    await d.dismiss();
  });
  let downloads = 0;
  page.on("download", () => downloads++);
  await page
    .getByRole("button", { name: "Exportar Excel (.xls)", exact: true })
    .click();
  expect(messages).toContain("Não há registros para exportar.");
  expect(downloads).toBe(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.locator(".hamburger").click();
  await page
    .locator(".nav-group-toggle")
    .filter({ hasText: "DIAGNÓSTICO" })
    .click();
  await page
    .locator(".nav-group-links")
    .getByRole("button", { name: "Diagnósticos", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Exportar todas (.xls)", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Exportar todas (.xls)", exact: true })
    .click();
  expect(downloads).toBe(0);
});
