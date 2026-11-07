import { test, expect } from "@playwright/test";

// Each public-screen test owns the unauthenticated browser state.
test.beforeEach(async ({ page }) => {
  await page.route("**/api/crm/auth/session", async route => {
    if (route.request().method() === "GET") return route.fulfill({json:{authenticated:false}});
    await route.fallback();
  });
});

test("knowledge editor requires an authenticated operator",async({page})=>{
 await page.goto("/operator/knowledge");
 await expect(page.getByRole("heading",{name:"Acesso ao Painel Master"})).toBeVisible();
 await expect(page).toHaveURL(/\/\?error=unauthorized_client$/);
 await expect(page.getByRole("button",{name:"Salvar no Supabase"})).toHaveCount(0);
});
test("knowledge read endpoint rejects unauthenticated session",async({request})=>{
 const r=await request.get("/api/crm/operator/knowledge?tenant=123e4567-e89b-12d3-a456-426614174000");
 expect(r.status()).toBe(403);
 expect((await r.json()).error).toBe("tenant_forbidden");
});
test("knowledge editing is inaccessible without a valid session",async({request,baseURL})=>{
 const r=await request.post("/api/crm/operator/knowledge",{headers:{"Origin":new URL(baseURL!).origin},data:{
  tenantId:"123e4567-e89b-12d3-a456-426614174000",title:"Atendimento comercial",body:"Dados verificados"
 }});
 expect(r.status()).toBe(403);
 expect((await r.json()).error).toBe("tenant_forbidden");
});
for(const width of [360,390,768,1366]){
 test(`knowledge editor fits screen ${width}`,async({page})=>{
  await page.setViewportSize({width,height:820});await page.goto("/operator/knowledge");
  await expect(page.getByRole("heading",{name:"Acesso ao Painel Master"})).toBeVisible();
  const over=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
  expect(over).toBe(false);
 });
}
