import {test,expect} from "@playwright/test";

// Each public-screen test owns the unauthenticated browser state.
test.beforeEach(async ({ page }) => {
  await page.route("**/api/crm/auth/session", async route => {
    if (route.request().method() === "GET") return route.fulfill({json:{authenticated:false}});
    await route.fallback();
  });
});

test("root address shows one email/password login, not legacy admin token",async({page})=>{
  await page.goto("/");
  await expect(page.getByRole("heading",{name:"Acesso ao Painel Master"})).toBeVisible();
  await expect(page.getByPlaceholder("E-mail do administrador",{exact:true})).toBeVisible();
  await expect(page.getByPlaceholder("Senha",{exact:true})).toBeVisible();
  await expect(page.getByText("CRM_LAB_ADMIN_TOKEN")).toHaveCount(0);
  await expect(page.getByRole("button",{name:"Entrar no Painel Master",exact:true})).toBeVisible();
});
test("operator alias redirects unauthenticated users to the canonical login",async({page})=>{
  await page.goto("/operator");
  await expect(page).toHaveURL(/\/\?error=unauthorized_client$/);
  await expect(page.getByRole("heading",{name:"Acesso ao Painel Master"})).toBeVisible();
});
test("legacy token lab redirects to the canonical login without exposing token access",async({page})=>{
  await page.goto("/lab");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading",{name:"Acesso ao Painel Master"})).toBeVisible();
  await expect(page.getByRole("textbox",{name:"Token administrativo do CRM"})).toHaveCount(0);
});
for(const width of [360,390,768,1366]){
 test(`canonical login fits viewport ${width}`,async({page})=>{
  await page.setViewportSize({width,height:840});
  await page.goto("/");
  await expect(page.getByRole("heading",{name:"Acesso ao Painel Master"})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1)).toBe(false);
 });
}
