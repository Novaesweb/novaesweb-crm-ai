import {test,expect} from "@playwright/test";

// Each public-screen test owns the unauthenticated browser state.
test.beforeEach(async ({ page }) => {
  await page.route("**/api/crm/auth/session", async route => {
    if (route.request().method() === "GET") return route.fulfill({json:{authenticated:false}});
    await route.fallback();
  });
});

test("Master page is available but never reveals companies without operator login",async({page})=>{
 await page.goto("/admin");
 await expect(page.getByRole("heading",{name:"Acesso ao Painel Master"})).toBeVisible();
 await expect(page).toHaveURL(/\/\?error=unauthorized_admin$/);
 await expect(page.getByText("Nenhuma empresa cadastrada no CRM.")).toHaveCount(0);
});
test("Master overview rejects unauthenticated requests",async({request})=>{
 const res=await request.get("/api/crm/admin/overview");
 expect(res.status()).toBe(401);
 expect(res.headers()["cache-control"]).toContain("no-store");
 const payload=await res.json();
 expect(payload.error).toBe("unauthorized");
});
for(const width of [360,390,768,1366]){
 test(`Master viewport ${width}: no horizontal overflow`,async({page})=>{
  await page.setViewportSize({width,height:880});
  await page.goto("/admin");
  await expect(page.getByRole("heading",{name:"Acesso ao Painel Master"})).toBeVisible();
  const over=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1);
  expect(over).toBe(false);
 });
}

test("Company registration rejects requests without operator session",async({request,baseURL})=>{
 const response=await request.post("/api/crm/admin/companies",{
  headers:{"Origin":new URL(baseURL!).origin},
  data:{name:"Empresa não deve ser criada"}
 });
 expect(response.status()).toBe(401);
});
test("Company registration rejects invalid name and cannot create data",async({request,baseURL})=>{
 const response=await request.post("/api/crm/admin/companies",{
  headers:{"Origin":new URL(baseURL!).origin},
  data:{name:""}
 });
 expect(response.status()).toBe(400);
});

test("suspension refuses unknown callers and missing confirmation",async({request,baseURL})=>{
 const unauth=await request.post("/api/crm/admin/suspension",{
  headers:{Origin:new URL(baseURL!).origin},
  data:{tenantId:"123e4567-e89b-12d3-a456-426614174000",suspend:true,confirm:true}
 });
 expect(unauth.status()).toBe(401);
 const invalid=await request.post("/api/crm/admin/suspension",{
  headers:{Origin:new URL(baseURL!).origin},
  data:{tenantId:"123e4567-e89b-12d3-a456-426614174000",suspend:true}
 });
 expect(invalid.status()).toBe(400);
});
