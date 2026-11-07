import { test, expect, type Page } from "@playwright/test";

test.setTimeout(60_000);

test.use({ baseURL: process.env.CRM_E2E_BASE_URL || "http://127.0.0.1:3000" });

const CORE_FEATURES = ["ai_chat","human_handoff","simulator","business_hours_basic","quick_replies","basic_indicators"];
const FEATURE_STATES = Object.fromEntries(CORE_FEATURES.map(id=>[id,{id,name:id,description:id,minPlanId:"crm-start",minPlanName:"CRM Start",state:"allowed"}]));
const OWN_TENANT = "11111111-1111-4111-8111-111111111111";

if (process.env.CRM_E2E_CHROMIUM) {
  test.use({ launchOptions: { executablePath: process.env.CRM_E2E_CHROMIUM } });
}

async function mockMaster(page: Page) {
  await page.context().addCookies([{ name: "nw_master_session", value: "navigation-fixture", domain: "127.0.0.1", path: "/", httpOnly: true, sameSite: "Lax" }]);
  // This suite owns all API data; no Supabase, AI or WhatsApp call leaves the browser.
  await page.route("**/api/**", async route => {
    if (route.request().method() !== "GET") {
      throw new Error(`Unexpected mutation in navigation test: ${route.request().url()}`);
    }
    const path = new URL(route.request().url()).pathname;
    let json: unknown = {};
    if (path === "/api/crm/auth/session") json = { authenticated: true, role: "master", redirectTo: "/admin" };
    else if (path === "/api/crm/admin/clients") json = { clients: [], upgradeRequests: [] };
    else if (path === "/api/crm/admin/plans") json = { plans: [], clientCounts: {}, enrolledStores: {} };
    else if (path === "/api/crm/admin/ai-lab/models") json = {
      models: [{ id: "fixture-chat", name: "Modelo de teste", provider: "Fixture", speed: "Local" }],
      currentDefaults: { primaryModel: "fixture-chat", fallbackModel: "fixture-chat" },
    };
    else if (path === "/api/crm/operator/data") json = {
      tenants: [{ id: OWN_TENANT, name: "NovaesWeb", status: "active" }],
      selectedTenant: OWN_TENANT, contacts: [], conversations: [], messages: [], tags: [], contactTags: [],
      allowedFeatures: CORE_FEATURES, featureStates: FEATURE_STATES,
      plan: { name: "CRM Premium", price: "159,90", dueDate: "2099-12-01", status: "paid", autoBlock: false, quotaLimit: 1500, quotaUsed: 0 },
    };
    else if (path === "/api/crm/operator/ai-settings") json = { enabled: true, agentLabel: "Assistente de teste", instructions: "", storeInfo: "", allowedFeatures: CORE_FEATURES, featureStates: FEATURE_STATES, whatsappSlots: [], quickReplies: [], teamOperators: [] };
    else if (path === "/api/crm/operator/knowledge") json = { articles: [], limited: false };
    else if (path === "/api/crm/operator/features") json = { quickReplies: [], teamOperators: [], featureStates: FEATURE_STATES };
    else if (path === "/api/crm/whatsapp/status") json = { connected: false, state: "disconnected", whatsappSlots: [] };
    else throw new Error(`Unmocked API in navigation test: ${path}`);
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(json) });
  });
}

async function expectSingleMaster(page: Page) {
  await expect(page.getByRole("navigation", { name: "Menu do Master", exact: true })).toHaveCount(1);
  await expect(page.locator("aside.nw-sidebar")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Sair do Master", exact: true })).toHaveCount(1);
  await expect(page.getByRole("link", { name: /Voltar à Central Master|Abrir Meu CRM/ })).toHaveCount(0);
}

test.beforeEach(async ({ page }) => { await mockMaster(page); });

test("Master keeps providers and own CRM inside its single navigation", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Gestão de Clientes e Mensalidades", exact: true })).toBeVisible();
  const menu = page.getByRole("navigation", { name: "Menu do Master", exact: true });
  await menu.getByRole("button", { name: "Provedores de IA", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\?section=providers$/);
  await expect(page.getByRole("heading", { name: "Provedores de IA", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Provedores de inteligência artificial", exact: true })).toBeVisible();
  await expectSingleMaster(page);
  const dataRequest = page.waitForRequest(r => new URL(r.url()).pathname === "/api/crm/operator/data");
  await menu.getByRole("button", { name: "CRM NovaesWeb", exact: true }).click();
  expect(new URL((await dataRequest).url()).searchParams.get("tenant")).toBe("novaesweb");
  await expect(page).toHaveURL(/\/admin\?section=crm$/);
  await expect(page.getByRole("navigation", { name: "Seções do CRM NovaesWeb", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "NovaesWeb", exact: true })).toBeVisible();
  await expectSingleMaster(page);
  const sections = page.getByRole("navigation", { name: "Seções do CRM NovaesWeb", exact: true });
  for (const label of ["Atendimentos", "WhatsApp", "IA e conhecimento", "Base de conhecimento", "Simulador", "Horários", "Equipe", "Relatórios", "Contatos", "Plano"]) {
    const button = sections.getByRole("button", { name: label, exact: true });
    await button.click();
    await expect(button).toHaveAttribute("aria-current", "page");
    await expectSingleMaster(page);
    await expect(page).toHaveURL(/\/admin\?section=crm$/);
  }
  expect(errors).toEqual([]);
  await sections.getByRole("button", { name: "Atendimentos", exact: true }).click();
  await page.screenshot({ path: "test-results/unified-master-desktop.png", fullPage: true });
  await page.reload();
  await expect(page.getByRole("navigation", { name: "Seções do CRM NovaesWeb", exact: true })).toBeVisible();
  await expectSingleMaster(page);
});

for (const [legacy, section] of [["/admin/ai-providers", "providers"], ["/cliente?tenant=novaesweb", "crm"]] as const) {
  test(`legacy ${legacy} opens the unified Master`, async ({ page }) => {
    await page.goto(legacy);
    await expect(page).toHaveURL(new RegExp(`/admin\\?section=${section}$`));
    await expect(page.getByRole("heading", { name: section === "crm" ? "CRM NovaesWeb" : "Provedores de IA", exact: true, level: 1 })).toBeVisible();
    await expectSingleMaster(page);
  });
}

test("mobile Master and embedded sections fit the viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const section of ["providers", "crm"]) {
    await page.goto(`/admin?section=${section}`);
    await expect(page.getByRole("heading", { name: section === "crm" ? "NovaesWeb" : "Provedores de IA", exact: true })).toBeVisible();
    await expectSingleMaster(page);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await page.screenshot({ path: `test-results/unified-master-mobile-${section}.png`, fullPage: true });
  }
});



