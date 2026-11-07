import { test, expect } from "@playwright/test";

// Each public-screen test owns the unauthenticated browser state.
test.beforeEach(async ({ page }) => {
  await page.route("**/api/crm/auth/session", async route => {
    if (route.request().method() === "GET") return route.fulfill({json:{authenticated:false}});
    await route.fallback();
  });
});

test("private CRM shows no fictitious conversations or KPIs before login", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Acesso ao Painel Master" })).toBeVisible();
  await expect(page.getByText("Ana Souza", { exact: true })).toHaveCount(0);
  await expect(page.getByText("187", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Token administrativo do CRM" })).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Menu do Master" })).toHaveCount(0);
});

for (const width of [1920, 1366, 768, 390, 360]) {
  test(`viewport ${width}: private dashboard redirects without horizontal overflow`, async ({ page }) => {
    await page.setViewportSize({ width, height: width < 800 ? 844 : 900 });
    await page.goto("/cliente");
    await expect(page).toHaveURL(/\/\?error=unauthorized_client$/);
    await expect(page.getByRole("heading", { name: "Acesso ao Painel Master" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)).toBe(false);
    await expect(page.getByRole("button", {name: "Contatos", exact: true})).toHaveCount(0);
  });
}

test("preparation operations stay behind login", async ({ page }) => {
  await page.goto("/cliente");
  await expect(page).toHaveURL(/\/\?error=unauthorized_client$/);
  await expect(page.getByText("Verificação antes de atender clientes")).toHaveCount(0);
  await expect(page.getByRole("button", {name: "Preparação", exact:true})).toHaveCount(0);
});

test("CRM modules stay behind admin login", async ({ page }) => {
  for (const section of ["clients", "plans", "kpis", "providers", "crm"]) {
    await page.goto(`/admin?section=${section}`);
    await expect(page).toHaveURL(/\/\?error=unauthorized_admin$/);
    await expect(page.getByRole("heading", {name:"Acesso ao Painel Master"})).toBeVisible();
    await expect(page.getByRole("navigation", {name:"Menu do Master"})).toHaveCount(0);
  }
});
