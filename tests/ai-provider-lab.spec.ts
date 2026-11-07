import { test, expect } from "@playwright/test";

// Each public-screen test owns the unauthenticated browser state.
test.beforeEach(async ({ page }) => {
  await page.route("**/api/crm/auth/session", async route => {
    if (route.request().method() === "GET") return route.fulfill({json:{authenticated:false}});
    await route.fallback();
  });
});

test("Master AI provider catalog redirects unauthenticated users without exposing the lab",async({page})=>{
 await page.goto("/admin/ai-providers");
 await expect(page.getByRole("heading",{name:"Acesso ao Painel Master"})).toBeVisible();
 await expect(page).toHaveURL(/\/\?error=unauthorized_admin$/);
 await expect(page.getByRole("navigation",{name:"Menu do Master"})).toHaveCount(0);
 await expect(page.getByRole("button",{name:"Testar resposta sem WhatsApp"})).toHaveCount(0);
});
test("Master AI provider APIs reject unauthenticated access",async({request})=>{
 const res=await request.get("/api/crm/admin/ai-lab");
 expect(res.status()).toBe(401);
 expect(res.headers()["cache-control"]).toContain("no-store");
 const testResponse=await request.post("/api/crm/admin/ai-lab/test",{
  headers:{"Origin":"http://127.0.0.1:3000"},
  data:{model:"openrouter/free",question:"Qual horário da loja?"}
 });
 expect([401,403]).toContain(testResponse.status());
});
test("Master lab text test rejects cross-site requests",async({request})=>{
 const res=await request.post("/api/crm/admin/ai-lab/test",{
  headers:{"Origin":"https://malicious.example"},data:{model:"openrouter/free",question:"Teste"}
 });
 expect(res.status()).toBe(403);
});
for(const width of [360,390,768,1366]){
 test(`AI providers Master view ${width} has no horizontal overflow`,async({page})=>{
  await page.setViewportSize({width,height:850});await page.goto("/admin/ai-providers");
  await expect(page.getByRole("heading",{name:"Acesso ao Painel Master"})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1)).toBe(false);
 });
}
