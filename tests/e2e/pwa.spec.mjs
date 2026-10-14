import { test, expect } from "@playwright/test";
test.use({ baseURL: "http://127.0.0.1:4173" });
test("build de produção: app shell, service worker e reabertura offline", async ({
  page,
  context,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Acesse sua conta" }),
  ).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect
    .poll(() =>
      page.evaluate(async () =>
        (await caches.keys()).some((key) => key.startsWith("sgo-shell-")),
      ),
    )
    .toBe(true);
  await page.reload();
  expect(await page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(
    true,
  );
  await page.locator("input[type=email]").fill("demo@example.com");
  await page.getByRole("button", { name: "Entrar em demonstração" }).click();
  await expect(
    page.getByRole("heading", { name: "Obras", exact: true }),
  ).toBeVisible();
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Acesse sua conta" }),
  ).toBeVisible();
  await page.locator("input[type=email]").fill("demo@example.com");
  await page.getByRole("button", { name: "Entrar em demonstração" }).click();
  await expect(
    page.getByRole("heading", { name: "Obras", exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
