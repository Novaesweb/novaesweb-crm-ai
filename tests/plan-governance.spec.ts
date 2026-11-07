import { test, expect, type Page } from "@playwright/test";

test.setTimeout(60_000);
test.use({ baseURL: process.env.CRM_E2E_BASE_URL || "http://127.0.0.1:3000" });
if (process.env.CRM_E2E_CHROMIUM) test.use({ launchOptions: { executablePath: process.env.CRM_E2E_CHROMIUM } });
const TENANT = "11111111-1111-4111-8111-111111111111";
const CORE = ["ai_chat","human_handoff","simulator","business_hours_basic","quick_replies","basic_indicators"];
const BUSINESS = [...CORE,"business_hours","commercial_tags","handoff_summary","sound_notifications","model_fallback","conversation_priority","satisfaction_survey","commercial_indicators"];
const ALL = [...BUSINESS,"advanced_reports","satisfaction_analytics","operator_indicators","advanced_commercial_filters"];

async function fixture(page: Page, tier: "start"|"business"|"premium", state: "allowed"|"maintenance"|"suspended" = "allowed") {
  await page.context().addCookies([{name:"nw_master_session",value:"fixture",domain:"127.0.0.1",path:"/",httpOnly:true,sameSite:"Lax"}]);
  const allowed = tier === "start" ? CORE : tier === "business" ? BUSINESS : ALL;
  const max = tier === "start" ? 1 : tier === "business" ? 3 : 5;
  const featureStates = Object.fromEntries(ALL.map(id=>[id,{id,name:`Recurso ${id}`,description:`Descrição ${id}`,minPlanId:CORE.includes(id)?"crm-start":BUSINESS.includes(id)?"crm-business":"crm-premium",minPlanName:CORE.includes(id)?"CRM Start":BUSINESS.includes(id)?"CRM Business":"CRM Premium",state:state === "suspended" ? "suspended" : state === "maintenance" && id === "ai_chat" ? "maintenance" : allowed.includes(id)?"allowed":"locked_by_plan",reason:state === "allowed" ? undefined : "Indisponível temporariamente"}]));
  const slots = [1,2,3,4,5].map(slot=>({slot,label:`WhatsApp #${slot}`,instanceName:slot===1?"loja_fixture":`loja_fixture_${slot}`,unlocked:slot<=max&&state==="allowed",minPlanId:slot===1?"crm-start":slot<=3?"crm-business":"crm-premium",minPlanName:slot===1?"CRM Start":slot<=3?"CRM Business":"CRM Premium",status:slot<=max?"disconnected":"locked",channelId:null,pausedByDowngrade:false}));
  const plan = {name:`CRM ${tier}`,planId:`crm-${tier}`,maxWhatsappConnections:max,maxOperators:max,quotaLimit:tier==="start"?200:tier==="business"?600:1500,quotaUsed:2,status:"paid",dueDate:"2099-12-01",autoBlock:false};
  const requests: Record<string,unknown>[] = [];
  await page.route("**/api/**", async route=>{
    const request=route.request(), path=new URL(request.url()).pathname;
    let json: unknown;
    if(request.method()!=="GET") {
      if(path!=="/api/crm/operator/features" || request.postDataJSON()?.action!=="request_upgrade") throw new Error(`Unexpected mutation ${path}`);
      requests.push(request.postDataJSON());json={requested:true,message:"Solicitação registrada"};
    } else if(path==="/api/crm/auth/session") json={authenticated:true,role:"master"};
    else if(path==="/api/crm/admin/clients")json={clients:[],upgradeRequests:[]};
    else if(path==="/api/crm/admin/plans")json={plans:[],clientCounts:{},enrolledStores:{}};
    else if(path==="/api/crm/operator/data")json={tenants:[{id:TENANT,name:"NovaesWeb",status:"active"}],selectedTenant:TENANT,contacts:[],conversations:[],messages:[],tags:[],contactTags:[],allowedFeatures:allowed,featureStates,isSuspended:state==="suspended",plan};
    else if(path==="/api/crm/operator/ai-settings")json={agentLabel:"Fixture",enabled:true,storeInfo:"",allowedFeatures:allowed,featureStates,whatsappSlots:slots,quickReplies:[],teamOperators:[],plan};
    else if(path==="/api/crm/operator/features")json={featureStates,quickReplies:[],teamOperators:[],reports:{basicIndicators:{quotaUsed:2,quotaLimit:200,quotaPercent:1,totalConversations:7,activeConversations:3,aiConversations:4,humanConversations:3,totalContacts:5},commercialIndicators:tier==="start"?null:{tagBreakdown:{Interessado:2},priorityBreakdown:{urgent:0,high:1,normal:2,low:0},handoffCount:3,handoffRate:40,totalSurveys:2,avgSatisfaction:4.5},premiumAnalytics:tier!=="premium"?null:{starDistribution:{1:0,2:0,3:0,4:1,5:1},csatPercent:100,aiAvgRating:4,humanAvgRating:5,detractors:[],operatorMetrics:[{operatorId:TENANT,name:"Ana",role:"agent",conversationsHandled:7,surveysCount:2,avgRating:4.5}],channelsSummary:[]}}};
    else if(path==="/api/crm/whatsapp/status")json={connected:false,state:"disconnected",whatsappSlots:slots};
    else throw new Error(`Unmocked ${path}`);
    await route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(json)});
  });
  return {requests,max};
}

for(const tier of ["start","business","premium"] as const) {
  test(`${tier}: real API slot contract enforces 1/3/5 and preserves report envelope`,async({page})=>{
    const {max}=await fixture(page,tier);
    await page.goto("/admin?section=crm");
    const nav=page.getByRole("navigation",{name:"Seções do CRM NovaesWeb"});
    await nav.getByRole("button",{name:"WhatsApp",exact:true}).click();
    await expect(page.locator('[data-testid^="whatsapp-slot-"]')).toHaveCount(5);
    await expect(page.locator('[data-testid^="whatsapp-slot-"][data-locked="true"]')).toHaveCount(5-max);
    for(let slot=max+1;slot<=5;slot++) await expect(page.getByTestId(`whatsapp-slot-${slot}`).getByRole("button",{name:`Selecionar WhatsApp #${slot}`})).toBeDisabled();
    await nav.getByRole("button",{name:"Relatórios",exact:true}).click();
    await expect(page.getByRole("heading",{name:"Indicadores Básicos de Operação",exact:true})).toBeVisible();
    if(tier==="premium") await expect(page.getByRole("heading",{name:"Indicadores por atendente",exact:true})).toBeVisible();
  });
}

test("Start slot 5 upgrade preserves Premium ID in the request",async({page})=>{
  const {requests}=await fixture(page,"start");
  await page.goto("/admin?section=crm");
  await page.getByRole("navigation",{name:"Seções do CRM NovaesWeb"}).getByRole("button",{name:"WhatsApp",exact:true}).click();
  await page.getByTestId("whatsapp-slot-5").getByRole("button",{name:/Solicitar CRM Premium/}).click();
  const dialog=page.getByRole("dialog",{name:"Solicitar upgrade de plano"});
  await expect(dialog.getByLabel("Plano Desejado")).toHaveValue("crm-premium");
  await dialog.getByRole("button",{name:"Confirmar Solicitação de Upgrade"}).click();
  await expect(dialog.getByText("Solicitação registrada")).toBeVisible();
  expect(requests[0]).toMatchObject({tenantId:TENANT,action:"request_upgrade",targetPlanId:"crm-premium"});
  expect(requests[0]).not.toHaveProperty("requestedPlan");
});

for(const state of ["maintenance","suspended"] as const) {
  test(`${state}: no connection or upgrade offer for operational lock`,async({page})=>{
    await fixture(page,"premium",state);
    await page.goto("/admin?section=crm");
    await page.getByRole("navigation",{name:"Seções do CRM NovaesWeb"}).getByRole("button",{name:"WhatsApp",exact:true}).click();
    await expect(page.locator('[data-testid^="whatsapp-slot-"][data-locked="true"]')).toHaveCount(5);
    await expect(page.getByRole("button",{name:/Solicitar CRM/})).toHaveCount(0);
    await expect(page.getByRole("button",{name:/Gerar.*QR|Conectar WhatsApp/}).first()).toBeDisabled();
  });
}
