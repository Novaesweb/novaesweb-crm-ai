import "server-only";
import type { Incoming } from "@/lib/agent/parse";
import { getEffectiveTenantPlan } from "./plans";
import { extractSlotFromInstanceName } from "./whatsapp-slots";
import { resolveChannelForInstance } from "./supabase-ingest";

export async function outboundAllowed(incoming: Incoming): Promise<boolean> {
  try {
    if (incoming.instance === "crmtest") return true;
    const url = process.env.CRM_SUPABASE_URL?.trim().replace(/\/$/, "");
    const key = process.env.CRM_SUPABASE_SERVICE_ROLE_KEY?.trim();
    if (!url || !key) return false;

    // 1. Resolve channel & tenant for this instance
    const channel = await resolveChannelForInstance(incoming.instance).catch(() => null);
    const tenantId = channel?.tenant_id;
    if (!tenantId || channel?.status === "paused") return false;
    const plan = await getEffectiveTenantPlan(tenantId);
    if (plan.isSuspended || plan.featureStates?.ai_chat?.state !== "allowed" || extractSlotFromInstanceName(incoming.instance) > plan.maxWhatsappConnections) return false;
    if (tenantId) {
      const rTenant = await fetch(`${url}/rest/v1/crm_tenants?id=eq.${tenantId}&select=status`, {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
        cache: "no-store"
      });
      if (!rTenant.ok) return false;
      const tenants = (await rTenant.json()) as Array<{ status: string }>;
      if (tenants?.[0]?.status !== "active") {
        return false;
      }

      // 2. Block AI if conversation is in human mode, waiting for human ('pending'), or closed ('paused'/'resolved')
      const rContact = await fetch(`${url}/rest/v1/crm_contacts?tenant_id=eq.${tenantId}&phone=eq.${incoming.number}&select=id`, {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
        cache: "no-store"
      });
      if (!rContact.ok) return false;
      const contacts = (await rContact.json()) as Array<{ id: string }>;
      if (contacts?.[0]?.id) {
        const rConv = await fetch(
          `${url}/rest/v1/crm_conversations?tenant_id=eq.${tenantId}&contact_id=eq.${contacts[0].id}&select=mode,status,assigned_to&limit=1`,
          { headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: "no-store" }
        );
        if (!rConv.ok) return false;
        const convs = (await rConv.json()) as Array<{ mode: string; status: string; assigned_to: string | null }>;
        if (convs?.[0]) {
          if (convs[0].mode !== "ai" || convs[0].status === "pending" || convs[0].status === "resolved") {
            return false;
          }
        }
      }
    }

    return true;
  } catch {
    return true;
  }
}
