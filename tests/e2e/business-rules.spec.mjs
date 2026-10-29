import { test, expect } from "@playwright/test";
import { newWork, syncStages } from "../../src/model.ts";
async function login(page) {
  const works = ["Água", "Esgoto"].map((ae, index) => {
    const w = newWork();
    Object.assign(w, {
      ae,
      address: "Obra regra " + index,
      city: "Suzano",
      dataValidated: true,
    });
    w.stages.forEach((i) => {
      i.status = "AGUARDANDO";
    });
    w.stages[6].status = "EM ANDAMENTO";
    return syncStages(w);
  });
  await page.addInitScript((works) => {
    if (!localStorage.getItem("sgo_works_v1"))
      localStorage.setItem("sgo_works_v1", JSON.stringify(works));
  }, works);
  await page.goto("/");
  await page.locator("input[type=email]").fill("demo@example.com");
  await page.getByRole("button", { name: "Entrar em demonstração" }).click();
  await expect(page.locator(".work-row")).toHaveCount(2);
}
test("carteira combina A/E com cards, atualiza contadores e permite desmarcar", async ({
  page,
}) => {
  await login(page);
  const toggle = page.locator(".nav-group-toggle").filter({ hasText: "OBRAS" });
  if ((await toggle.getAttribute("aria-expanded")) !== "true")
    await toggle.click();
  await page
    .locator(".nav-group-links")
    .getByRole("button", { name: "Carteira de Atividades", exact: true })
    .click();
  const cards = page.locator(".portfolio-kpis");
  const diagnosis = cards.getByRole("button", { name: /Diagnóstico/ });
  await expect(diagnosis.locator("strong")).toHaveText("2");
  await page.getByRole("button", { name: /^Filtros/ }).click();
  await page
    .getByRole("combobox", { name: "A/E", exact: true })
    .selectOption("Água");
  await page.getByRole("button", { name: "Aplicar", exact: true }).click();
  await expect(diagnosis.locator("strong")).toHaveText("1");
  await diagnosis.click();
  await expect(diagnosis).toHaveAttribute("aria-pressed", "true");
  await expect(
    cards.getByRole("button", { name: /Materiais/ }).locator("strong"),
  ).toHaveText("0");
  await expect(
    page
      .locator(".portfolio-section tbody tr")
      .filter({ hasText: "Obra regra 1" }),
  ).toHaveCount(0);
  await diagnosis.click();
  await expect(diagnosis).toHaveAttribute("aria-pressed", "false");
  await expect(
    cards.getByRole("button", { name: /Materiais/ }).locator("strong"),
  ).toHaveText("1");
  await page.getByRole("button", { name: /^Filtros/ }).click();
  await page
    .getByRole("button", { name: "Limpar filtros", exact: true })
    .click();
  await expect(diagnosis.locator("strong")).toHaveText("2");
});

test("cancelar, recarregar e reabrir restaura etapas e bloqueia status dos documentos", async ({
  page,
}) => {
  await login(page);
  await page.locator(".work-row").first().click();
  await page.getByRole("button", { name: /^ETAPAS/ }).click();
  const block = page
    .locator(".accordion")
    .filter({ has: page.getByRole("button", { name: /^ETAPAS/ }) });
  await block.getByRole("button", { name: "EDITAR", exact: true }).click();
  const execution = block
    .locator("tr")
    .filter({ hasText: "Execução de Obra" })
    .locator("select.status-select");
  await execution.selectOption("CANCELADO");
  await expect(
    block
      .locator("tr")
      .filter({ hasText: "Materiais" })
      .locator("select.status-select"),
  ).toBeDisabled();
  await block.getByRole("button", { name: "Confirmar alterações" }).click();
  await expect
    .poll(async () =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("sgo_works_v1"))[0].stages[0].status,
      ),
    )
    .toBe("CANCELADO");
  await login(page);
  await page.locator(".work-row").first().click();
  await page.getByRole("button", { name: /^CHECKLIST DE INÍCIO/ }).click();
  const initial = page
    .locator(".accordion")
    .filter({
      has: page.getByRole("button", { name: /^CHECKLIST DE INÍCIO/ }),
    });
  await initial.getByRole("button", { name: "EDITAR", exact: true }).click();
  await expect(initial.locator("select.status-select").first()).toBeDisabled();
  await initial.getByRole("button", { name: "Cancelar", exact: true }).click();
  await page.getByRole("button", { name: /^ETAPAS/ }).click();
  await block.getByRole("button", { name: "EDITAR", exact: true }).click();
  await expect(execution).toBeEnabled();
  await execution.selectOption("CONCLUÍDO");
  await block.getByRole("button", { name: "Confirmar alterações" }).click();
  await expect
    .poll(async () =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("sgo_works_v1"))[0].stages[0].status,
      ),
    )
    .toBe("AGUARDANDO");
});
