import "server-only";
import type { EffectiveTenantPlan } from "@/lib/crm/plans";
import { tenantInstanceSlug } from "@/lib/crm/supabase-ingest";

export type WhatsappSlotInfo = {
  slot: 1 | 2 | 3 | 4 | 5;
  label: string;
  instanceName: string;
  channelId: string | null;
  unlocked: boolean;
  status: "disconnected" | "connecting" | "connected" | "paused" | "locked";
  pausedByDowngrade: boolean;
  minPlanId: "crm-start" | "crm-business" | "crm-premium";
  minPlanName: string;
  lockedReason?: string;
};

export function expectedSlotInstanceName(tenantName: string, slot: number, existingSlot1Instance?: string | null): string {
  const baseSlug = tenantInstanceSlug(tenantName || "empresa");
  if (slot <= 1) {
    return existingSlot1Instance?.trim().toLowerCase() || baseSlug;
  }
  return `${baseSlug}_${slot}`;
}

export function extractSlotFromInstanceName(instanceName: string): 1 | 2 | 3 | 4 | 5 {
  const norm = instanceName.trim().toLowerCase();
  const match = norm.match(/_([2345])$/);
  if (match) {
    return Number(match[1]) as 2 | 3 | 4 | 5;
  }
  return 1;
}

/**
 * Build the 5 WhatsApp slots for a tenant based on their EffectiveTenantPlan and existing crm_channels rows.
 */
export function buildTenantWhatsappSlots(
  tenantName: string,
  channels: Array<{ id?: string; instance_name: string; status: string }>,
  effectivePlan: Pick<EffectiveTenantPlan, "maxWhatsappConnections" | "isSuspended">
): WhatsappSlotInfo[] {
  const maxAllowed = Math.max(1, Math.min(5, effectivePlan.maxWhatsappConnections || 1));

  // Map existing channels by slot number (1..5)
  const bySlot = new Map<number, { id?: string; instance_name: string; status: string }>();
  for (const ch of channels) {
    if (!ch.instance_name) continue;
    const slotNum = extractSlotFromInstanceName(ch.instance_name);
    if (!bySlot.has(slotNum)) {
      bySlot.set(slotNum, ch);
    }
  }

  const existingSlot1 = bySlot.get(1)?.instance_name || null;
  const slots: WhatsappSlotInfo[] = [];

  for (const slot of [1, 2, 3, 4, 5] as const) {
    const ch = bySlot.get(slot);
    const unlocked = slot <= maxAllowed && !effectivePlan.isSuspended;
    const minPlanId = slot === 1 ? "crm-start" : slot <= 3 ? "crm-business" : "crm-premium";
    const minPlanName = slot === 1 ? "CRM Start" : slot <= 3 ? "CRM Business" : "CRM Premium";
    const instanceName = ch?.instance_name || expectedSlotInstanceName(tenantName, slot, existingSlot1);

    let status: WhatsappSlotInfo["status"] = "locked";
    let pausedByDowngrade = false;
    let lockedReason: string | undefined;

    if (!unlocked) {
      if (effectivePlan.isSuspended) {
        status = "paused";
        lockedReason = "Conta suspensa administrativamente ou período de teste encerrado.";
      } else {
        status = ch ? "paused" : "locked";
        pausedByDowngrade = Boolean(ch);
        lockedReason = slot <= 3
          ? "Disponível a partir do plano CRM Business (até 3 WhatsApps)."
          : "Disponível exclusivamente no plano CRM Premium (até 5 WhatsApps).";
      }
    } else {
      if (!ch) {
        status = "disconnected";
      } else if (ch.status === "connected" || ch.status === "open") {
        status = "connected";
      } else if (ch.status === "paused") {
        // Channel was paused previously; if slot is now unlocked, show as disconnected so user can reconnect or resume
        status = "disconnected";
      } else {
        status = "disconnected";
      }
    }

    slots.push({
      slot,
      label: `WhatsApp #${slot}`,
      instanceName,
      channelId: ch?.id || null,
      unlocked,
      status,
      pausedByDowngrade,
      minPlanId,
      minPlanName,
      lockedReason
    });
  }

  return slots;
}

/**
 * When a tenant's plan changes (upgrade or downgrade), synchronize crm_channels statuses:
 * - Excess channels (slot > newMaxConnections) are safely set to status = 'paused' without deleting history/contacts.
 * - Previously paused channels that are now within newMaxConnections are restored to 'disconnected' (ready for use).
 */
export async function syncWhatsappChannelsForPlanLimit(
  tenantId: string,
  newMaxConnections: number,
  supaUrl: string,
  serviceKey: string
): Promise<{ pausedInstances: string[]; restoredInstances: string[] }> {
  const pausedInstances: string[] = [];
  const restoredInstances: string[] = [];

  if (!supaUrl || !serviceKey || !/^[0-9a-f-]{36}$/i.test(tenantId)) throw new Error("channel_sync_not_configured");
  if (!Number.isInteger(newMaxConnections) || newMaxConnections < 1 || newMaxConnections > 5) throw new Error("invalid_channel_limit");
  const rChannels = await fetch(
    `${supaUrl}/rest/v1/crm_channels?tenant_id=eq.${tenantId}&select=id,instance_name,status`,
    { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }, cache: "no-store", signal: AbortSignal.timeout(7000) }
  );
  if (!rChannels.ok) throw new Error(`channel_sync_lookup_failed:${rChannels.status}`);
  const channels = await rChannels.json() as Array<{ id: string; instance_name: string; status: string }>;
  for (const ch of channels) {
    const slot = extractSlotFromInstanceName(ch.instance_name);
    const nextStatus = slot > newMaxConnections ? "paused" : ch.status === "paused" ? "disconnected" : null;
    if (!nextStatus || nextStatus === ch.status) continue;
    const response = await fetch(`${supaUrl}/rest/v1/crm_channels?id=eq.${ch.id}&tenant_id=eq.${tenantId}`, {
      method: "PATCH", cache: "no-store", signal: AbortSignal.timeout(7000),
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify({ status: nextStatus })
    });
    if (!response.ok) throw new Error(`channel_sync_update_failed:${response.status}`);
    const updated = await response.json() as Array<{ id: string }>;
    if (!Array.isArray(updated) || updated.length !== 1 || updated[0].id !== ch.id) throw new Error("channel_sync_update_unconfirmed");
    (nextStatus === "paused" ? pausedInstances : restoredInstances).push(ch.instance_name);
  }
  return { pausedInstances, restoredInstances };
}
