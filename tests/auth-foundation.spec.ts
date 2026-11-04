import { test, expect } from "@playwright/test";

test("login is visible but does not allow public registration without configuration", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Acesso administrativo" })).toBeVisible();
  await expect(page.getByText("Cadastro público desativado")).toBeVisible();
  await expect(page.getByRole("button", { name: "Entrar no Master" })).toBeDisabled();
  await expect(page.getByRole("link", { name: "Voltar para a demonstração" })).toBeVisible();
});

test("Master route does not expose administrative data without configuration", async ({ page }) => {
  await page.goto("/master");
  await expect(page.getByRole("heading", { name: "Configuração necessária" })).toBeVisible();
  await expect(page.getByText("Nenhuma empresa ou agente", { exact: false })).toHaveCount(0);
});

test("Dashboard Master card opens dedicated protected route", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Painel Master Gestão da plataforma/i }).click();
  await expect(page).toHaveURL(/\/master$/);
  await expect(page.getByRole("heading", { name: "Configuração necessária" })).toBeVisible();
});
