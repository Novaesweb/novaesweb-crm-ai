import { NextRequest } from "next/server";
import { authorizeCrmTenant, ownsCrmResource, patchCrmConfig } from "@/lib/crm/tenant-access";
import { isAllowedOrigin, privateJson, supabaseSettings } from "@/lib/crm/supabase-server";
import { requireTenantFeature } from "@/lib/crm/plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// DB check constraint on crm_tags.color allows: 'neutral','purple','blue','green','amber','red'
const DEFAULT_TAGS = [
  { name: "Interessado", color: "blue" },
  { name: "Orçamento enviado", color: "purple" },
  { name: "Venda confirmada", color: "green" },
  { name: "Cliente perdido", color: "neutral" }
];

async function verifyTenantAccess(request: NextRequest, tenantId: string): Promise<boolean> {
  return Boolean(await authorizeCrmTenant(request, tenantId));
}

export async function GET(request: NextRequest) {
  try {
    const tenantId = request.nextUrl.searchParams.get("tenant");
    if (!tenantId || !UUID.test(tenantId)) return privateJson({ error: "invalid_tenant" }, 400);

    const authorized = await verifyTenantAccess(request, tenantId);
    if (!authorized) return privateJson({ error: "not_authorized" }, 403);

    const guard = await requireTenantFeature(tenantId, "commercial_tags");
    if (!guard.allowed) {
      return privateJson({
        tags: [],
        contactTags: [],
        conversationTags: {},
        featureLocked: true,
        state: guard.state,
        message: guard.message
      });
    }

    const { url } = supabaseSettings();
    const secret = process.env.CRM_SUPABASE_SERVICE_ROLE_KEY ?? "";
    if (secret.length < 30) return privateJson({ error: "service_not_configured" }, 503);

    // 1. Fetch tags for this tenant
    const rTags = await fetch(url + `/rest/v1/crm_tags?tenant_id=eq.${tenantId}&select=id,name,color`, {
      headers: { apikey: secret, Authorization: "Bearer " + secret },
      cache: "no-store"
    });
    let tags = rTags.ok ? ((await rTags.json()) as Array<{ id: string; name: string; color: string }>) : [];

    // Seed default tags if none exist
    if (!tags.length) {
      for (const dt of DEFAULT_TAGS) {
        await fetch(url + "/rest/v1/crm_tags", {
          method: "POST",
          headers: { apikey: secret, Authorization: "Bearer " + secret, "Content-Type": "application/json" },
          body: JSON.stringify({ tenant_id: tenantId, name: dt.name, color: dt.color })
        }).catch(() => {});
      }
      const rNewTags = await fetch(url + `/rest/v1/crm_tags?tenant_id=eq.${tenantId}&select=id,name,color`, {
        headers: { apikey: secret, Authorization: "Bearer " + secret },
        cache: "no-store"
      });
      tags = rNewTags.ok ? ((await rNewTags.json()) as Array<{ id: string; name: string; color: string }>) : [];
    }

    // 2. Fetch all contact tags for this tenant + conversationTags map from settings
    const [rContactTags, rSettings] = await Promise.all([
      fetch(url + `/rest/v1/crm_contact_tags?tenant_id=eq.${tenantId}&select=contact_id,tag_id`, {
        headers: { apikey: secret, Authorization: "Bearer " + secret },
        cache: "no-store"
      }),
      fetch(url + `/rest/v1/crm_tenant_settings?tenant_id=eq.${tenantId}&select=business_description&limit=1`, {
        headers: { apikey: secret, Authorization: "Bearer " + secret },
        cache: "no-store"
      })
    ]);
    const contactTags = rContactTags.ok ? ((await rContactTags.json()) as Array<{ contact_id: string; tag_id: string }>) : [];
    let conversationTags: Record<string, string> = {};
    let tagHistory: Array<Record<string, any>> = [];
    if (rSettings.ok) {
      const sRows = (await rSettings.json()) as Array<{ business_description: string }>;
      if (sRows[0]?.business_description?.startsWith("{")) {
        try {
          const parsed = JSON.parse(sRows[0].business_description);
          if (parsed.conversationTags && typeof parsed.conversationTags === "object") {
            conversationTags = parsed.conversationTags;
          }
          if (Array.isArray(parsed.tagHistory)) {
            tagHistory = parsed.tagHistory;
          }
        } catch {}
      }
    }

    return privateJson({ tags, contactTags, conversationTags, tagHistory });
  } catch {
    return privateJson({ error: "tags_unavailable" }, 500);
  }
}

export async function POST(request: NextRequest) {
  if (!isAllowedOrigin(request.headers.get("origin"), request.url)) {
    return privateJson({ error: "origin_forbidden" }, 403);
  }
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return privateJson({ error: "json_required" }, 415);
  }

  try {
    const body = await request.json();
    const tenantId = typeof body.tenantId === "string" ? body.tenantId : "";
    const contactId = typeof body.contactId === "string" ? body.contactId : "";
    const conversationId = typeof body.conversationId === "string" ? body.conversationId : "";
    const tagId = typeof body.tagId === "string" ? body.tagId : "";
    const tagName = typeof body.tagName === "string" ? body.tagName.trim() : "";
    const action = body.action === "remove" ? "remove" : "set";

    if (!UUID.test(tenantId)) {
      return privateJson({ error: "invalid_params" }, 400);
    }

    const authorized = await verifyTenantAccess(request, tenantId);
    if (!authorized) return privateJson({ error: "not_authorized" }, 403);
    for (const [table, id] of [["crm_contacts", contactId], ["crm_conversations", conversationId], ["crm_tags", tagId]] as const) {
      if (id && !await ownsCrmResource(tenantId, table, id)) return privateJson({ error: "resource_not_found" }, 404);
    }


    const guard = await requireTenantFeature(tenantId, "commercial_tags");
    if (!guard.allowed) {
      return privateJson({
        error: guard.errorCode || "feature_not_included_in_plan",
        state: guard.state,
        message: guard.message || "Etiquetas comerciais requerem o plano CRM Business ou CRM Premium."
      }, guard.statusHttp);
    }

    const { url } = supabaseSettings();
    const secret = process.env.CRM_SUPABASE_SERVICE_ROLE_KEY ?? "";
    if (secret.length < 30) return privateJson({ error: "service_not_configured" }, 503);

    // 1. Update crm_contact_tags if contactId and tagId are UUIDs
    if (UUID.test(contactId) && UUID.test(tagId)) {
      if (action === "remove") {
        await fetch(url + `/rest/v1/crm_contact_tags?tenant_id=eq.${tenantId}&contact_id=eq.${contactId}&tag_id=eq.${tagId}`, {
          method: "DELETE",
          headers: { apikey: secret, Authorization: "Bearer " + secret }
        });
      } else {
        await fetch(url + `/rest/v1/crm_contact_tags?tenant_id=eq.${tenantId}&contact_id=eq.${contactId}`, {
          method: "DELETE",
          headers: { apikey: secret, Authorization: "Bearer " + secret }
        });
        await fetch(url + "/rest/v1/crm_contact_tags", {
          method: "POST",
          headers: { apikey: secret, Authorization: "Bearer " + secret, "Content-Type": "application/json" },
          body: JSON.stringify({ tenant_id: tenantId, contact_id: contactId, tag_id: tagId })
        });
      }
    }

    // 2. Also persist in crm_tenant_settings.business_description -> conversationTags & tagHistory
    const targetKey = conversationId || contactId;
    if (targetKey) {
      const rGet = await fetch(url + `/rest/v1/crm_tenant_settings?tenant_id=eq.${tenantId}&select=business_description&limit=1`, {
        headers: { apikey: secret, Authorization: "Bearer " + secret },
        cache: "no-store"
      });
      if (rGet.ok) {
        const sRows = (await rGet.json()) as Array<{ business_description: string }>;
        let parsed: Record<string, any> = {};
        if (sRows[0]?.business_description?.startsWith("{")) {
          try { parsed = JSON.parse(sRows[0].business_description); } catch {}
        }
        const convTags: Record<string, string> = parsed.conversationTags && typeof parsed.conversationTags === "object"
          ? parsed.conversationTags
          : {};
        const tagHistory: Array<Record<string, any>> = Array.isArray(parsed.tagHistory)
          ? parsed.tagHistory
          : [];

        const resolvedLabel = tagName || tagId;
        if (action === "remove" || !resolvedLabel) {
          delete convTags[targetKey];
          if (contactId) delete convTags[contactId];
        } else {
          convTags[targetKey] = resolvedLabel;
          if (contactId) convTags[contactId] = resolvedLabel;
          tagHistory.unshift({
            id: `th_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            conversationId: conversationId || null,
            contactId: contactId || null,
            tag: resolvedLabel,
            updatedAt: new Date().toISOString()
          });
        }

        parsed.conversationTags = convTags;
        parsed.tagHistory = tagHistory.slice(0, 200);

        await patchCrmConfig(tenantId, { conversationTags: convTags, tagHistory: tagHistory.slice(0, 200) });
      }
    }

    return privateJson({
      success: true,
      action,
      tagId,
      tagName: tagName || tagId
    });
  } catch {
    return privateJson({ error: "failed_to_update_tags" }, 500);
  }
}
