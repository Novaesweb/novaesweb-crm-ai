import "server-only";
import { NextRequest } from "next/server";
import { verifyMasterRequest } from "./master-auth";
import { supabaseRows, verifyOperator } from "./supabase-server";
import type { EffectiveTenantPlan, FeatureId } from "./plans";
import { expectedSlotInstanceName } from "./whatsapp-slots";

export const TENANT_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export type CrmTenant = { id: string; name: string; status: string };
export type CrmAccess = {
  isMaster: boolean;
  operatorId: string | null;
  operatorEmail: string;
  token: string;
  tenants: CrmTenant[];
  memberships: Array<{ tenant_id: string; role: string }>;
};

export function crmServiceConfig() {
  const url = (process.env.CRM_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL)?.trim().replace(/\/$/, "") || "";
  const key = (process.env.CRM_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY)?.trim() || "";
  if (!url || key.length < 30) throw new Error("crm_service_not_configured");
  return { url, key };
}

async function serviceRows<T>(path: string): Promise<T> {
  const { url, key } = crmServiceConfig();
  const response = await fetch(`${url}/rest/v1/${path}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
    cache: "no-store", signal: AbortSignal.timeout(7000)
  });
  if (!response.ok) throw new Error("crm_access_lookup_failed");
  return await response.json() as T;
}

/** Master CRM privileges are limited to the single agency tenant, resolved server-side. */
type AccessChecks = {
  verifyMaster?: typeof verifyMasterRequest;
  verifyOperator?: typeof verifyOperator;
  rows?: typeof supabaseRows;
};

export async function getCrmAccess(request: NextRequest, checks: AccessChecks = {}): Promise<CrmAccess | null> {
  const master = await (checks.verifyMaster ?? verifyMasterRequest)(request);
  if (master.authorized) {
    const configuredId = process.env.CRM_MASTER_OWN_TENANT_ID?.trim();
    if (configuredId && !TENANT_UUID.test(configuredId)) throw new Error("invalid_master_own_tenant");
    const filter = configuredId ? `id=eq.${configuredId}` : "name=ilike.NovaesWeb";
    const tenants = await serviceRows<CrmTenant[]>(`crm_tenants?select=id,name,status&${filter}&limit=2`);
    if (tenants.length !== 1 || !TENANT_UUID.test(tenants[0].id)) throw new Error("master_own_tenant_unavailable");
    return { isMaster: true, operatorId: null, operatorEmail: master.actor, token: "", tenants,
      memberships: [{ tenant_id: tenants[0].id, role: "owner" }] };
  }
  const operator = await (checks.verifyOperator ?? verifyOperator)();
  if (!operator) return null;
  const query = checks.rows ?? supabaseRows;
  const memberships = await query<Array<{ tenant_id: string; role: string }>>(
    `crm_tenant_memberships?select=tenant_id,role&is_active=eq.true&user_id=eq.${operator.id}`, operator.token);
  const ids = memberships.map(m => m.tenant_id).filter(id => TENANT_UUID.test(id));
  const tenants = ids.length ? await query<CrmTenant[]>(
    `crm_tenants?select=id,name,status&id=in.(${ids.join(",")})&order=name.asc`, operator.token) : [];
  return { isMaster: false, operatorId: operator.id, operatorEmail: operator.email, token: operator.token, tenants, memberships };
}

export function selectCrmTenant(access: CrmAccess, requested?: string | null): CrmTenant | undefined {
  if (requested === "novaesweb") {
    if (access.isMaster) return access.tenants[0];
    return access.tenants.find(t => t.name.trim().toLowerCase() === "novaesweb");
  }
  if (requested) return TENANT_UUID.test(requested) ? access.tenants.find(t => t.id === requested) : undefined;
  return access.tenants[0];
}

export async function authorizeCrmTenant(request: NextRequest, tenantId: string, roles?: string[]) {
  const access = await getCrmAccess(request);
  if (!access || !TENANT_UUID.test(tenantId) || !access.tenants.some(t => t.id === tenantId)) return null;
  if (roles && !access.memberships.some(m => m.tenant_id === tenantId && roles.includes(m.role))) return null;
  return access;
}

export async function ownsCrmResource(tenantId: string, table: "crm_conversations" | "crm_contacts" | "crm_tags", resourceId: string) {
  if (!TENANT_UUID.test(tenantId) || !TENANT_UUID.test(resourceId)) return false;
  const rows = await serviceRows<Array<{ id: string }>>(`${table}?select=id&tenant_id=eq.${tenantId}&id=eq.${resourceId}&limit=1`);
  return rows.length === 1;
}

/** Validate channel ownership before any Evolution or cached QR operation. */
export async function authorizeCrmInstance(request: NextRequest, tenantId: string | undefined, instanceName: string, allowNew = false) {
  const access = await getCrmAccess(request);
  if (!access) return null;
  const tenant = selectCrmTenant(access, tenantId);
  if (!tenant) return null;
  const channels = await serviceRows<Array<{ instance_name: string }>>(
    `crm_channels?select=instance_name&tenant_id=eq.${tenant.id}`);
  if (channels.some(c => c.instance_name === instanceName)) return { tenant, access };
  if (!allowNew) return null;
  const slot1 = channels.find(c => !/_[2345]$/.test(c.instance_name))?.instance_name;
  if (![1, 2, 3, 4, 5].some(slot => expectedSlotInstanceName(tenant.name, slot, slot1) === instanceName)) return null;
  // Instance names are global in Evolution. Never adopt another company's channel.
  const owners = await serviceRows<Array<{ tenant_id: string }>>(
    `crm_channels?select=tenant_id&instance_name=eq.${encodeURIComponent(instanceName)}&limit=2`);
  if (owners.some(c => c.tenant_id !== tenant.id)) return null;
  return { tenant, access };
}

/** A contracted feature is usable only when its current governance state allows it. */
export function crmFeatureAllowed(plan: EffectiveTenantPlan, feature: FeatureId): boolean {
  return !plan.isSuspended && plan.featureStates?.[feature]?.state === "allowed";
}

/** Merge only the fields owned by an operation under the database settings lock. */
export async function patchCrmConfig(tenantId: string, patch: Record<string, unknown>): Promise<void> {
  if (!TENANT_UUID.test(tenantId)) throw new Error("invalid_tenant");
  const { url, key } = crmServiceConfig();
  const response = await fetch(url + "/rest/v1/rpc/crm_patch_tenant_config", {
    method: "POST", headers: { apikey: key, Authorization: "Bearer " + key, "Content-Type": "application/json" },
    body: JSON.stringify({ p_tenant: tenantId, p_patch: patch }), cache: "no-store", signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error("crm_settings_write_failed");
}
