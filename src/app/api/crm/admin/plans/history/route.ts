import { NextRequest } from "next/server";
import { privateJson } from "@/lib/crm/supabase-server";
import { verifyMasterRequest } from "@/lib/crm/master-auth";
import { getPlanAuditHistory } from "@/lib/crm/plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const auth = await verifyMasterRequest(request);
    if (!auth.authorized) {
      return privateJson({ error: "unauthorized" }, 401);
    }

    const history = await getPlanAuditHistory();
    return privateJson({ history });
  } catch (e) {
    return privateJson({ error: e instanceof Error ? e.message : "history_failed" }, 500);
  }
}

