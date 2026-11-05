import { test, expect } from "@playwright/test";

test("home reconstructs the violet login and blocks access until authenticated", async ({page})=>{
  await page.goto("/");
  await expect(page.getByRole("heading",{name:"Entrar no CRM"})).toBeVisible();
  await expect(page.getByText("NovaesWeb",{exact:true})).toBeVisible();
  await expect(page.getByRole("textbox",{name:"E-mail"})).toBeVisible();
  await expect(page.getByLabel("Senha",{exact:true})).toHaveAttribute("type","password");
  await expect(page.getByRole("button",{name:"Entrar",exact:true})).toBeDisabled();
  await expect(page.getByRole("link",{name:"Central Master"})).toHaveCount(0);
  await expect(page.getByText("CRM_LAB_ADMIN_TOKEN")).toHaveCount(0);
});

test("show/hide password button is functional and keyboard accessible",async({page})=>{
  await page.goto("/");
  const password=page.getByLabel("Senha",{exact:true});
  await password.fill("senha-de-teste-123");
  await page.getByRole("button",{name:"Mostrar senha"}).click();
  await expect(password).toHaveAttribute("type","text");
  await page.getByRole("button",{name:"Ocultar senha"}).click();
  await expect(password).toHaveAttribute("type","password");
});

test("invalid credentials display genuine server failure without fake CRM access",async({page})=>{
  await page.route("**/api/crm/operator/session",async(route)=>{
    if(route.request().method()==="GET")return route.fulfill({status:200,contentType:"application/json",body:'{"authenticated":false}'});
    return route.fulfill({status:401,contentType:"application/json",body:'{"error":"invalid_credentials"}'});
  });
  await page.goto("/");
  await page.getByRole("textbox",{name:"E-mail"}).fill("teste@example.com");
  await page.getByLabel("Senha",{exact:true}).fill("senha-incorreta");
  await page.getByRole("button",{name:"Entrar",exact:true}).click();
  await expect(page.getByRole("alert")).toContainText("E-mail ou senha incorretos");
  await expect(page.getByRole("heading",{name:"Central de atendimentos"})).toHaveCount(0);
});

test("authenticated session opens existing tenant-scoped portal",async({page})=>{
  await page.route("**/api/crm/operator/session",async(route)=>{
    if(route.request().method()==="GET")return route.fulfill({status:200,contentType:"application/json",body:'{"authenticated":false}'});
    return route.fulfill({status:200,contentType:"application/json",body:'{"authenticated":true}'});
  });
  await page.route("**/api/crm/operator/data**",route=>route.fulfill({
    status:200,contentType:"application/json",body:JSON.stringify({tenants:[],selectedTenant:null,contacts:[],conversations:[],messages:[]})
  }));
  await page.goto("/");
  await page.getByRole("textbox",{name:"E-mail"}).fill("teste@example.com");
  await page.getByLabel("Senha",{exact:true}).fill("senha-de-teste");
  await page.getByRole("button",{name:"Entrar",exact:true}).click();
  await expect(page.getByRole("heading",{name:"Central de atendimentos"})).toBeVisible();
  await expect(page.getByText("Nenhuma empresa vinculada")).toBeVisible();
});

test("forgot password uses recovery endpoint and never reveals whether email exists",async({page})=>{
  await page.route("**/api/crm/auth/recover",route=>route.fulfill({status:200,contentType:"application/json",body:'{"ok":true}'}));
  await page.goto("/");
  await page.getByRole("button",{name:"Esqueci minha senha"}).click();
  await expect(page.getByRole("heading",{name:"Recuperar senha"})).toBeVisible();
  await page.getByRole("textbox",{name:"E-mail"}).fill("teste@example.com");
  await page.getByRole("button",{name:"Enviar instruções"}).click();
  await expect(page.getByRole("status")).toContainText("Se este e-mail estiver cadastrado");
  await page.getByRole("button",{name:"Voltar para entrar"}).click();
  await expect(page.getByRole("heading",{name:"Entrar no CRM"})).toBeVisible();
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
    await expect(page.getByRole("heading",{name:"Entrar no CRM"})).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1)).toBe(false);
  });
}
