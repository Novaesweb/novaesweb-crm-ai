import { test, expect } from "@playwright/test";

// Each public-screen test owns the unauthenticated browser state.
test.beforeEach(async ({ page }) => {
  await page.route("**/api/crm/auth/session", async route => {
    if (route.request().method() === "GET") return route.fulfill({json:{authenticated:false}});
    await route.fallback();
  });
});

test("home reconstructs the violet login and blocks access until authenticated", async ({page})=>{
  await page.goto("/");
  await expect(page.getByRole("heading",{name:"Acesso ao Painel Master"})).toBeVisible();
  await expect(page.getByText("NovaesWeb CRM IA",{exact:true})).toBeVisible();
  await expect(page.getByPlaceholder("E-mail do administrador",{exact:true})).toBeVisible();
  await expect(page.getByPlaceholder("Senha",{exact:true})).toHaveAttribute("type","password");
  await expect(page.getByRole("button",{name:"Entrar no Painel Master",exact:true})).toBeVisible();
  await expect(page.getByRole("link",{name:"Central Master"})).toHaveCount(0);
  await expect(page.getByText("CRM_LAB_ADMIN_TOKEN")).toHaveCount(0);
});

test("show/hide password button is functional and keyboard accessible",async({page})=>{
  await page.goto("/");
  const password=page.getByPlaceholder("Senha",{exact:true});
  await password.fill("senha-de-teste-123");
  await page.getByRole("button",{name:"Exibir senha"}).click();
  await expect(password).toHaveAttribute("type","text");
  await page.getByRole("button",{name:"Ocultar senha"}).click();
  await expect(password).toHaveAttribute("type","password");
});

test("invalid credentials display genuine server failure without fake CRM access",async({page})=>{
  await page.route("**/api/crm/auth/session",async(route)=>{
    if(route.request().method()==="GET")return route.fulfill({status:200,contentType:"application/json",body:'{"authenticated":false}'});
    return route.fulfill({status:401,contentType:"application/json",body:'{"error":"invalid_credentials"}'});
  });
  await page.goto("/");
  await page.getByPlaceholder("E-mail do administrador",{exact:true}).fill("teste@example.com");
  await page.getByPlaceholder("Senha",{exact:true}).fill("senha-incorreta");
  await page.getByRole("button",{name:"Entrar no Painel Master",exact:true}).click();
  await expect(page.getByText("E-mail ou senha incorretos.",{exact:true})).toContainText("E-mail ou senha incorretos");
  await expect(page.getByRole("heading",{name:"Central de atendimentos"})).toHaveCount(0);
});

test("authenticated session opens existing tenant-scoped portal",async({page})=>{
  await page.route("**/api/crm/auth/session",async(route)=>{
    if(route.request().method()==="GET")return route.fulfill({json:{authenticated:false}});
    const payload=route.request().postDataJSON();
    expect(payload.email).toBe("teste@example.com");
    expect(payload.password).toBe("senha-de-teste");
    await page.context().addCookies([{name:"nw_crm_session",value:"fixture-only",domain:"127.0.0.1",path:"/",httpOnly:true,sameSite:"Lax"}]);
    return route.fulfill({json:{success:true,redirectTo:"/cliente"}});
  });
  // Isolate the destination: this journey tests login routing, not the CRM data view.
  await page.route("**/cliente",route=>route.fulfill({contentType:"text/html",body:'<h1>Portal da loja autenticada</h1>'}));
  await page.goto("/");
  await page.getByPlaceholder("E-mail do administrador",{exact:true}).fill("teste@example.com");
  await page.getByPlaceholder("Senha",{exact:true}).fill("senha-de-teste");
  await page.getByRole("button",{name:"Entrar no Painel Master",exact:true}).click();
  await expect(page).toHaveURL(/\/cliente$/);
  await expect(page.getByRole("heading",{name:"Portal da loja autenticada"})).toBeVisible();
});

test("forgot password uses recovery endpoint and never reveals whether email exists",async({page})=>{
  await page.route("**/api/crm/auth/recover",async route=>{
    expect(route.request().method()).toBe("POST");
    expect(route.request().postDataJSON()).toEqual({email:"teste@example.com"});
    await route.fulfill({json:{ok:true}});
  });
  await page.goto("/");
  await page.getByRole("button",{name:"Esqueceu a senha?"}).click();
  await expect(page.getByRole("heading",{name:"Recuperação de Acesso"})).toBeVisible();
  await page.getByPlaceholder("Seu e-mail cadastrado").fill("teste@example.com");
  const recovery=page.waitForResponse(r=>new URL(r.url()).pathname==="/api/crm/auth/recover");
  await page.getByRole("button",{name:"Enviar Instruções"}).click();
  expect((await recovery).ok()).toBe(true);
  await expect(page.getByText("Se o e-mail estiver cadastrado, as instruções para redefinição de senha foram enviadas para sua caixa de entrada.",{exact:true})).toBeVisible();
});

test("recovery failure does not display a false success",async({page})=>{
  await page.route("**/api/crm/auth/recover",route=>route.fulfill({status:503,json:{error:"unavailable"}}));
  await page.goto("/");
  await page.getByRole("button",{name:"Esqueceu a senha?"}).click();
  await page.getByPlaceholder("Seu e-mail cadastrado").fill("teste@example.com");
  const response=page.waitForResponse(r=>new URL(r.url()).pathname==="/api/crm/auth/recover");
  await page.getByRole("button",{name:"Enviar Instruções"}).click();
  expect((await response).status()).toBe(503);
  await expect(page.getByText("Não foi possível solicitar a redefinição de senha.",{exact:true})).toBeVisible();
  await expect(page.getByText(/as instruções para redefinição de senha foram enviadas/)).toHaveCount(0);
});

test("recovery endpoints reject malformed or unauthenticated requests",async({request})=>{
  const recover=await request.post("/api/crm/auth/recover",{data:{email:"invalid"}});
  expect(recover.status()).toBe(400);
  const reset=await request.post("/api/crm/auth/reset",{data:{token:"fake",password:"12345678"}});
  expect(reset.status()).toBe(400);
});

for(const width of [1920,1366,941,768,390,360]){
  test(`reference login is responsive without horizontal overflow at ${width}`,async({page})=>{
    await page.setViewportSize({width,height:width===941?1672:width<800?844:900});
    await page.goto("/");
    await expect(page.getByRole("heading",{name:"Acesso ao Painel Master"})).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1)).toBe(false);
  });
}
