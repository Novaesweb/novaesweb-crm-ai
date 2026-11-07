import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { NextRequest } from "next/server";

// Security regressions: the former bypasses must be denied before external side effects.
// The actual route source executes; authentication, own-tenant resolution, plan
// storage, Redis, Supabase and Evolution are fixtures. Every fetch is intercepted
// and unexpected traffic fails. No real session, key, account or network is used.
// All responses below are isolated fixtures; these tests do not certify live tenant isolation.
const TENANT = "11111111-1111-4111-8111-111111111111";
const INSTANCE = "loja_fixture_5";
type Call = { url: string; method: string; body?: string };

function loadRoute(kind: "connect" | "status", planUnavailable = false, maxAllowed = 1, suspended = false, maintenance = false) {
  const calls: Call[] = [];
  const effectivePlan = {
    planId: "crm-start", planName: "CRM Start", maxWhatsappConnections: maxAllowed,
    isSuspended: suspended, featureStates: { ai_chat: { state: maintenance ? "maintenance" : suspended ? "suspended" : "allowed" } },
  };
  const fixtureFetch = async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method || "GET";
    calls.push({ url, method, body: typeof init?.body === "string" ? init.body : undefined });
    const parsed = new URL(url);
    if (parsed.hostname === "fixture.supabase.co") {
      if (parsed.pathname === "/rest/v1/crm_tenants" && method === "GET") return Response.json([{ name: "Fixture" }]);
      if (parsed.pathname === "/rest/v1/crm_channels") {
        if (method === "GET") return Response.json([
          { id: TENANT, instance_name: "loja_fixture", status: "connected" },
          { id: "22222222-2222-4222-8222-222222222222", instance_name: INSTANCE, status: "paused" },
        ]);
        if (method === "PATCH") return Response.json([{ id: TENANT }]);
      }
    }
    if (parsed.hostname === "evolution.fixture") {
      if (parsed.pathname === `/instance/connectionState/${INSTANCE}`) return Response.json({ instance: { state: "open" } });
      if (parsed.pathname === "/instance/fetchInstances") return Response.json([]);
      if (parsed.pathname === `/webhook/find/${INSTANCE}`) return Response.json({ enabled: true, url: "https://fixture.invalid/webhook" });
      if (parsed.pathname === `/webhook/set/${INSTANCE}` && method === "POST") return Response.json({ ok: true });
    }
    throw new Error(`Unexpected fixture fetch ${method} ${url}`);
  };
  const dependencies: Record<string, unknown> = {
    "next/server": { NextRequest, NextResponse: { json: Response.json.bind(Response) } },
    "@/lib/crm/tenant-access": {
      authorizeCrmInstance: async (_req: unknown, tenant: string, instance: string) => {
        assert.equal(tenant, TENANT);
        assert.equal(instance, INSTANCE);
        return { tenant: { id: TENANT, name: "Fixture" } };
      },
    },
    "@/lib/crm/supabase-server": {
      verifyOperator: async () => ({ id: TENANT }),
      isAllowedOrigin: () => true,
    },
    "@/lib/crm/master-auth": { verifyMasterRequest: async () => ({ authorized: false }) },
    "@/lib/crm/plans": {
      getEffectiveTenantPlan: async () => {
        if (planUnavailable) throw new Error("fixture_plan_unavailable");
        return effectivePlan;
      },
      getRedis: () => ({ status: "ready", set: async () => "OK", disconnect() {} }),
    },
    "@/lib/crm/whatsapp-slots": {
      extractSlotFromInstanceName: (name: string) => Number(name.match(/_([2345])$/)?.[1] || 1),
      // Not reached in the failure-to-resolve-plan reproduction.
      buildTenantWhatsappSlots: () => { throw new Error("Unexpected slot build after failed plan resolution"); },
    },
    ioredis: class { constructor() { throw new Error("Unexpected Redis connection"); } },
  };
  const filename = resolve("src/app/api/crm/whatsapp", kind, "route.ts");
  const output = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: filename,
  }).outputText;
  const fixtureModule = { exports: {} as Record<string, (req: NextRequest) => Promise<Response>> };
  const context = vm.createContext({
    module:fixtureModule, exports: fixtureModule.exports, Response, URL, AbortSignal, fetch: fixtureFetch, console,
    process: { env: {
      CRM_SUPABASE_URL: "https://fixture.supabase.co", CRM_SUPABASE_SERVICE_ROLE_KEY: "fixture-key-not-real-".repeat(3),
      EVOLUTION_API_URL: "https://evolution.fixture", EVOLUTION_API_KEY: "fixture-evolution-key",
    } },
    require: (id: string) => {
      assert.ok(Object.hasOwn(dependencies, id), `Unexpected dependency ${id}`);
      return dependencies[id];
    },
  });
  new vm.Script(output, { filename }).runInContext(context);
  return { handlers: fixtureModule.exports, calls };
}

test("Start rejects both a locked slot and a forged slot number for the same instance", async () => {
  const honest = loadRoute("connect");
  const createRequest = (slot: number) => new NextRequest("http://fixture.invalid/api/crm/whatsapp/connect", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tenantId: TENANT, instance: INSTANCE, slot }),
  });
  const denied = await honest.handlers.POST(createRequest(5));
  assert.equal(denied.status, 403);
  assert.equal((await denied.json()).error, "whatsapp_slot_locked");
  assert.equal(honest.calls.filter(c => c.url.startsWith("https://evolution.fixture")).length, 0);

  const forged = loadRoute("connect");
  const deniedForgery = await forged.handlers.POST(createRequest(1));
  assert.equal(deniedForgery.status, 403);
  assert.equal((await deniedForgery.json()).error, "slot_instance_mismatch");
  assert.equal(forged.calls.length, 0, "No database or Evolution mutation may happen for mismatched slot");

});

test("status fails closed before Evolution and writes when plan lookup fails", async () => {
  const fixture = loadRoute("status", true);
  const response = await fixture.handlers.GET(new NextRequest(
    `http://fixture.invalid/api/crm/whatsapp/status?tenantId=${TENANT}&instance=${INSTANCE}`,
  ));
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, "plan_verification_unavailable");
  assert.equal(fixture.calls.length, 0);
});

for (const [name, max, suspended, maintenance, expected] of [
  ["Start locked slot", 1, false, false, 403],
  ["Business locked slot", 3, false, false, 403],
  ["Premium suspended", 5, true, false, 403],
  ["Premium maintenance", 5, false, true, 503],
] as const) {
  test("status denies " + name + " without exposing QR or contacting Evolution", async () => {
    const fixture = loadRoute("status", false, max, suspended, maintenance);
    const response = await fixture.handlers.GET(new NextRequest(
      `http://fixture.invalid/api/crm/whatsapp/status?tenantId=${TENANT}&instance=${INSTANCE}`,
    ));
    assert.equal(response.status, expected);
    assert.equal((await response.json()).qrcode, undefined);
    assert.equal(fixture.calls.length, 0);
  });
}

for (const max of [3, 5]) {
  test("connect allows an owned slot within plan limit " + max, async () => {
    const fixture = loadRoute("connect", false, max);
    const response = await fixture.handlers.POST(new NextRequest("http://fixture.invalid/api/crm/whatsapp/connect", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenantId: TENANT, instance: INSTANCE, slot: 5 }),
    }));
    assert.equal(response.status, max === 5 ? 200 : 403);
    if (max === 3) assert.equal(fixture.calls.filter(c => c.url.startsWith("https://evolution.fixture")).length, 0);
    else assert.equal((await response.json()).connected, true);
  });
}
