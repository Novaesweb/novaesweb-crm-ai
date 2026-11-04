import { test, expect } from "@playwright/test";

test("desktop: estrutura, busca, filtro e envio simulado", async ({ page }) => {
  await page.setViewportSize({ width: 1648, height: 928 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(page.getByText("Caixa de Entrada")).toBeVisible();
  await expect(page.getByText("Ana Souza").first()).toBeVisible();
  await expect(page.getByText("Prévia visual do produto")).not.toBeVisible();
  await page.screenshot({ path: "screenshots/dashboard-1648.png", fullPage: true });

  const search = page.getByRole("textbox", { name: "Buscar conversas" });
  await search.fill("Carlos");
  await expect(page.getByRole("listitem").filter({ hasText: "Carlos Mendes" })).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: "Ana Souza" })).toHaveCount(0);
  await search.clear();

  await page.getByRole("button", { name: "Humano", exact: true }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "Mariana Silva" })).toBeVisible();
  await page.getByRole("button", { name: "Todas", exact: true }).click();
  await page.getByRole("listitem").filter({ hasText: "Carlos Mendes" }).click();

  const message = page.getByRole("textbox", { name: "Mensagem", exact: true });
  await message.fill("Mensagem de teste local");
  await page.getByRole("button", { name: "Adicionar mensagem à simulação" }).click();
  await expect(page.locator(".message-bubble p").filter({ hasText: "Mensagem de teste local" })).toBeVisible();
  await expect(page.getByRole("status")).toContainText("Nenhum WhatsApp foi acionado");
});

for (const width of [1920, 1366, 768, 390, 360]) {
  test(`viewport ${width}: sem rolagem horizontal da página`, async ({ page }) => {
    await page.setViewportSize({ width, height: width < 800 ? 844 : 900 });
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    await page.screenshot({ path: `screenshots/dashboard-${width}.png`, fullPage: true, animations: "disabled" });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(overflow, "A página não deve ultrapassar a largura da viewport").toBe(false);
    if (width <= 768) {
      await page.getByRole("button", { name: "Abrir menu" }).click();
      await expect(page.locator("aside[aria-label=\"Navegação principal\"]")).toBeVisible();
      await page.getByRole("button", { name: "Contatos" }).click();
      await expect(page.getByRole("status")).toContainText("Contatos");
    }
  });
}
