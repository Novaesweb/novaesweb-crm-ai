import { test, expect } from "@playwright/test";

test("private CRM shows no fictitious conversations or KPIs", async ({ page }) => {
  await page.setViewportSize({ width: 1648, height: 928 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Acessar atendimentos reais" })).toBeVisible();
  await expect(page.getByText("Ana Souza")).toHaveCount(0);
  await expect(page.getByText("187")).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Token administrativo do CRM" })).toBeVisible();
});

for (const width of [1920, 1366, 768, 390, 360]) {
  test(`viewport ${width}: sem rolagem horizontal da pagina`, async ({ page }) => {
    await page.setViewportSize({ width, height: width < 800 ? 844 : 900 });
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(overflow, "A pagina nao deve ultrapassar a largura da viewport").toBe(false);
    if (width <= 768) {
      await page.getByRole("button", { name: "Abrir menu" }).click();
      await expect(page.locator('aside[aria-label="Navegação principal"]')).toBeVisible();
      await page.getByRole("button", { name: "Contatos" }).click();
      await expect(page.getByRole("heading", { name: "Contatos" })).toBeVisible();
    }
  });
}

test("preparation navigation is present but does not expose operations without login", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Preparação" }).click();
  await expect(page.getByRole("heading", { name: "Preparação" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Acessar atendimentos reais" })).toBeVisible();
  await expect(page.getByText("Verificação antes de atender clientes")).toHaveCount(0);
});

test('new CRM module navigation stays behind admin login', async ({ page }) => { await page.goto('/'); for (const name of ['Base de Conhecimento','Equipe','Campanhas','Automações']) { await page.getByRole('button',{name,exact:true}).click(); await expect(page.getByRole('heading',{name,exact:true})).toBeVisible(); await expect(page.getByRole('heading',{name:'Acessar atendimentos reais'})).toBeVisible(); } });
