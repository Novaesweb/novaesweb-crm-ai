import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { MASTER_COOKIE_NAME, signMasterToken } from "./master-auth";
import { authorizeCrmInstance, authorizeCrmTenant, getCrmAccess, ownsCrmResource, selectCrmTenant } from "./tenant-access";

const OWN = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

test("Unauthenticated callers receive no access and client scope uses verified memberships only", async () => {
  const request = new NextRequest("http://localhost/api/crm/operator/data");
  const verifyMaster = async () => ({ authorized: false, actor: "" });
  assert.equal(await getCrmAccess(request, { verifyMaster, verifyOperator: async () => null }), null);
  const paths: string[] = [];
  const access = await getCrmAccess(request, {
    verifyMaster,
    verifyOperator: async () => ({ id: OTHER, email: "test@example.invalid", token: "operator-token" }),
    rows: async <T>(path: string, token: string) => {
      assert.equal(token, "operator-token");
      paths.push(path);
      return (path.startsWith("crm_tenant_memberships")
        ? [{ tenant_id: OTHER, role: "agent" }]
        : [{ id: OTHER, name: "Client Test", status: "active" }]) as T;
    }
  });
  assert.ok(access);
  assert.equal(access.isMaster, false);
  assert.equal(selectCrmTenant(access, OTHER)?.id, OTHER);
  assert.equal(selectCrmTenant(access, OWN), undefined);
  assert.equal(selectCrmTenant(access, "novaesweb"), undefined);
  assert.equal(selectCrmTenant(access, "invalid-uuid"), undefined);
  assert.ok(paths[0].includes(`user_id=eq.${OTHER}`));
  assert.ok(paths[1].includes(`id=in.(${OTHER})`));
});

test("Master CRM scope resolves the agency server-side and rejects other tenants and channels", async () => {
  const originalFetch = globalThis.fetch;
  const names = ["CRM_MASTER_SESSION_SECRET", "CRM_SUPABASE_URL", "CRM_SUPABASE_SERVICE_ROLE_KEY", "CRM_MASTER_OWN_TENANT_ID"];
  const previous = names.map(name => process.env[name]);
  process.env.CRM_MASTER_SESSION_SECRET = "test-secret-".repeat(5);
  process.env.CRM_SUPABASE_URL = "https://test-project.supabase.co";
  process.env.CRM_SUPABASE_SERVICE_ROLE_KEY = "test-service-key-".repeat(4);
  delete process.env.CRM_MASTER_OWN_TENANT_ID;
  const cookie = `${MASTER_COOKIE_NAME}=${signMasterToken("test_master")}`;
  const request = new NextRequest("http://localhost/api/crm/operator/data?tenant=novaesweb", { headers: { cookie } });
  let ambiguous = false;
  let resourceOwner = OWN;
  const lookups: string[] = [];
  globalThis.fetch = async input => {
    const url = new URL(String(input));
    lookups.push(url.href);
    let data: unknown = [];
    if (url.pathname.endsWith("/crm_tenants")) {
      assert.equal(url.searchParams.get("name"), "ilike.NovaesWeb");
      data = [{ id: OWN, name: "NovaesWeb", status: "active" }];
      if (ambiguous) data = [...data as object[], { id: OTHER, name: "NovaesWeb", status: "active" }];
    } else if (url.pathname.endsWith("/crm_channels")) {
      data = url.searchParams.has("instance_name") ? [{ tenant_id: OTHER }] : [{ instance_name: "novaesweb-ia-teste" }];
    } else if (url.pathname.endsWith("/crm_conversations")) {
      data = url.searchParams.get("tenant_id") === `eq.${resourceOwner}` ? [{ id: OWN }] : [];
    } else {
      assert.fail(`Unexpected lookup ${url.pathname}`);
    }
    return Response.json(data);
  };
  try {
    const access = await getCrmAccess(request);
    assert.ok(access);
    assert.equal(access.isMaster, true);
    assert.equal(access.operatorId, null);
    assert.equal(access.token, "");
    assert.deepEqual(access.tenants.map(t => t.id), [OWN]);
    assert.equal(selectCrmTenant(access, "novaesweb")?.id, OWN);
    assert.equal(selectCrmTenant(access, OTHER), undefined);
    assert.equal(selectCrmTenant(access, "wrong-alias"), undefined);
    assert.equal(await authorizeCrmTenant(request, OTHER), null);
    assert.ok(await authorizeCrmTenant(request, OWN, ["owner", "admin"]));
    assert.ok(await authorizeCrmInstance(request, OWN, "novaesweb-ia-teste"));
    assert.equal(await authorizeCrmInstance(request, OWN, "loja_other"), null);
    assert.equal(await authorizeCrmInstance(request, OTHER, "novaesweb-ia-teste"), null);
    assert.equal(await authorizeCrmInstance(request, OWN, "novaesweb-ia-teste_2", true), null, "must not adopt another tenant's instance");
    assert.ok(await ownsCrmResource(OWN, "crm_conversations", OWN));
    resourceOwner = OTHER;
    assert.equal(await ownsCrmResource(OWN, "crm_conversations", OWN), false);
    ambiguous = true;
    await assert.rejects(getCrmAccess(request), /master_own_tenant_unavailable/);
    assert.ok(lookups.length > 0);
  } finally {
    globalThis.fetch = originalFetch;
    names.forEach((name, index) => previous[index] === undefined ? delete process.env[name] : process.env[name] = previous[index]);
  }
});
