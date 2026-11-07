import { test, expect } from "@playwright/test";

// Each public-screen test owns the unauthenticated browser state.
test.beforeEach(async ({ page }) => {
  await page.route("**/api/crm/auth/session", async route => {
    if (route.request().method() === "GET") return route.fulfill({json:{authenticated:false}});
    await route.fallback();
  });
});

test("operator login does not offer public registration", async ({page}) => {
  await page.goto("/operator");
  await expect(page.getByRole("heading",{name:"Acesso ao Painel Master"})).toBeVisible();
  await expect(page.getByPlaceholder("E-mail do administrador",{exact:true})).toBeVisible();
  await expect(page.getByRole("button",{name:/Cadastrar|Criar conta/})).toHaveCount(0);
  await expect(page.getByRole("button",{name:"Novo contato"})).toHaveCount(0);
});
test("operator tenant data is private without a session", async ({request}) => {
  const res=await request.get("/api/crm/operator/data");
  expect(res.status()).toBe(401);
  expect(res.headers()["cache-control"]).toContain("no-store");
});
test("contact creation fails closed without credentials", async ({request,baseURL}) => {
  const res=await request.post("/api/crm/operator/contacts",{headers:{Origin:new URL(baseURL!).origin},data:{
    tenantId:"123e4567-e89b-12d3-a456-426614174000",name:"Teste",phone:"5511999998888"
  }});
  expect(res.status()).toBe(403);
  expect((await res.json()).error).toBe("forbidden");
});

test("operator login refuses malformed credentials without external secrets", async ({request}) => {
  const res=await request.post("/api/crm/operator/session",{data:{email:"x",password:"a"}});
  expect(res.status()).toBe(400);
});
for (const width of [390,768,1440]) test(`operator login fits viewport ${width}`,async ({page})=>{
  await page.setViewportSize({width,height:900});
  await page.goto("/operator");
  await expect(page.getByRole("heading",{name:"Acesso ao Painel Master"})).toBeVisible();
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1);
  expect(overflow).toBe(false);
});
