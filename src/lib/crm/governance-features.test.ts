import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import vm from "node:vm";
import ts from "typescript";
import { NextRequest } from "next/server";

const TENANT = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";
const NEW_USER = "33333333-3333-4333-8333-333333333333";

type Options = { max?: number; members?: number; authFails?: boolean; rpcLimit?: boolean; featureDenied?: boolean; maintenance?: boolean; anonymous?: boolean };
function fixture(options: Options = {}) {
  const calls: Array<{ path: string; method: string; body: Record<string, unknown> }> = [];
  const patches: Array<Record<string, unknown>> = [];
  const max = options.max ?? 1;
  const plan = { planId: max === 1 ? "crm-start" : "crm-business", planName: "Fixture plan", maxOperators: max, isSuspended: false, featureStates: {} };
  const headers = { "Content-Type": "application/json" };
  const fetchFixture = async (input: string | URL, init?: RequestInit) => {
    const u = new URL(String(input)), method = init?.method || "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    calls.push({ path: u.pathname, method, body });
    assert.equal(u.hostname, "fixture.supabase.co", "No external network is allowed");
    if (u.pathname.endsWith("/crm_tenant_settings") && method === "GET") return Response.json([{ business_description: "{}" }]);
    if (u.pathname.endsWith("/crm_tenant_memberships") && method === "GET") {
      assert.equal(u.searchParams.get("is_active"), "eq.true");
      return Response.json(Array.from({ length: options.members ?? 1 }, (_, i) => ({ user_id: i ? NEW_USER : USER, role: i ? "agent" : "owner" })));
    }
    if (u.pathname === "/auth/v1/admin/users" && method === "POST") return options.authFails ? Response.json({ error: "fixture_auth_failed" }, { status: 500 }) : Response.json({ id: NEW_USER });
    if (u.pathname === "/auth/v1/admin/users/" + NEW_USER && method === "DELETE") return Response.json({});
    if (u.pathname.endsWith("/rpc/crm_add_operator_membership")) return options.rpcLimit ? new Response("OPERATOR_LIMIT_REACHED", { status: 409 }) : Response.json({ added: true, count: 2 });
    throw new Error("Unexpected fixture operation " + method + " " + u.pathname);
  };
  const privateJson = (body: unknown, status = 200) => Response.json(body, { status });
  const dependencies: Record<string, unknown> = {
    "next/server": { NextRequest },
    "@/lib/crm/tenant-access": {
      authorizeCrmTenant: async () => options.anonymous ? null : { operatorId: USER, operatorEmail: "fixture@example.invalid" },
      ownsCrmResource: async () => true,
      crmFeatureAllowed: () => !options.featureDenied && !options.maintenance,
      patchCrmConfig: async (_tenant: string, patch: Record<string, unknown>) => { assert.equal(_tenant, TENANT); patches.push(patch); },
    },
    "@/lib/crm/supabase-server": { privateJson, isAllowedOrigin: () => true },
    "@/lib/crm/plans": {
      getEffectiveTenantPlan: async () => plan,
      getMasterPlans: async () => [{ id: "crm-business", name: "CRM Business", status: "active", price: "99,90" }, { id: "crm-premium", name: "CRM Premium", status: "active", price: "159,90" }],
      requireTenantFeature: async () => ({ allowed: !options.featureDenied && !options.maintenance, state: options.maintenance ? "maintenance" : options.featureDenied ? "locked_by_plan" : "allowed", statusHttp: options.maintenance ? 503 : options.featureDenied ? 403 : 200, errorCode: options.maintenance ? "FEATURE_MAINTENANCE" : "PLAN_FEATURE_LOCKED", effectivePlan: plan }),
    },
    "@/app/api/crm/operator/ai-settings/route": { DEFAULT_QUICK_REPLIES: [] },
    "@/lib/agent/processor": { getBrazilMonthKey: () => "2026-11" },
    ioredis: class {},
  };
  const filename = resolve("src/app/api/crm/operator/features/route.ts");
  const code = ts.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const fixtureModule = { exports: {} as Record<string, (req: NextRequest) => Promise<Response>> };
  const context = vm.createContext({ module:fixtureModule, exports: fixtureModule.exports, Response, URL, AbortSignal, console, fetch: fetchFixture,
    process: { env: { CRM_SUPABASE_URL: "https://fixture.supabase.co", CRM_SUPABASE_SERVICE_ROLE_KEY: "fixture-key-only-no-real-secrets" } },
    require: (id: string) => { assert.ok(Object.hasOwn(dependencies, id), "Unexpected dependency " + id); return dependencies[id]; },
  });
  new vm.Script(code, { filename }).runInContext(context);
  return { calls, patches,
    post: (body: Record<string, unknown>) => fixtureModule.exports.POST(new NextRequest("http://fixture.invalid/api/crm/operator/features", { method: "POST", headers, body: JSON.stringify({ tenantId: TENANT, ...body }) })),
    get: (query = "") => fixtureModule.exports.GET(new NextRequest("http://fixture.invalid/api/crm/operator/features?tenant=" + TENANT + query)),
  };
}
const operatorBody = { action: "add_operator", name: "Fixture Operator", email: "fixture@example.invalid", password: "fixture-password" };

test("Start counts its existing owner before creating another operator", async () => {
  const f = fixture();
  const response = await f.post(operatorBody);
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error, "OPERATOR_LIMIT_REACHED");
  assert.equal(f.calls.filter(c => c.path.startsWith("/auth/")).length, 0);
  assert.equal(f.patches.length, 0);
});
test("failed Auth creation never reports a fake operator or writes metadata", async () => {
  const f = fixture({ max: 3, authFails: true });
  const response = await f.post(operatorBody);
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, "operator_account_creation_failed");
  assert.equal(f.calls.filter(c => c.path.includes("/rpc/")).length, 0);
  assert.equal(f.patches.length, 0);
});
test("atomic limit rejection cleans up only the just-created account and reports no success", async () => {
  const f = fixture({ max: 3, rpcLimit: true });
  const response = await f.post(operatorBody);
  assert.equal(response.status, 403);
  assert.equal(f.calls.filter(c => c.path === "/auth/v1/admin/users/" + NEW_USER && c.method === "DELETE").length, 1);
  assert.equal(f.patches.length, 0);
});
test("operator success requires confirmed atomic membership and patches only team metadata", async () => {
  const f = fixture({ max: 3 });
  const response = await f.post(operatorBody);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).operator.id, NEW_USER);
  const rpc = f.calls.find(c => c.path.endsWith("/rpc/crm_add_operator_membership"))!;
  assert.equal(rpc.body.p_max, 3);
  assert.deepEqual(Object.keys(f.patches[0]), ["teamOperators"]);
  assert.equal(f.calls.filter(c => c.method === "DELETE").length, 0);
});
test("priority operation respects plan feature guard before any mutation", async () => {
  const f = fixture({ featureDenied: true });
  const response = await f.post({ action: "set_priority", conversationId: NEW_USER, priority: "urgent" });
  assert.equal(response.status, 403);
  assert.equal(f.patches.length, 0);
});
test("Premium upgrade preserves requested catalog plan and note instead of defaulting to Business", async () => {
  const f = fixture();
  const response = await f.post({ action: "request_upgrade", targetPlanId: "crm-premium", note: "Need five WhatsApps" });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.upgradeRequest.targetPlanId, "crm-premium");
  assert.equal(result.upgradeRequest.note, "Need five WhatsApps");
  assert.deepEqual(Object.keys(f.patches[0]), ["upgradeRequests"]);
});
test("unknown upgrade target is rejected without writing", async () => {
  const f = fixture();
  assert.equal((await f.post({ action: "request_upgrade", targetPlanId: "does-not-exist" })).status, 400);
  assert.equal(f.patches.length, 0);
});
test("advanced report filters require their own plan feature", async () => {
  const f = fixture({ featureDenied: true });
  assert.equal((await f.get("&operator=" + USER)).status, 403);
  assert.equal(f.calls.filter(c => c.path.endsWith("/crm_conversations")).length, 0);
});
test("maintenance blocks report computation before querying business resources", async () => {
  const f = fixture({ maintenance: true });
  assert.equal((await f.get()).status, 503);
  assert.equal(f.calls.filter(c => c.path.endsWith("/crm_conversations")).length, 0);
});
test("anonymous caller cannot create an operator or load tenant settings", async () => {
  const f = fixture({ anonymous: true });
  assert.equal((await f.post(operatorBody)).status, 401);
  assert.equal(f.calls.length, 0);
});

