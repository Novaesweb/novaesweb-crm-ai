import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Consulta mínima de leitura para o cron do Supabase. Nunca abre acesso público ao banco. */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseSecret = process.env.SUPABASE_SECRET_KEY;

  if (!cronSecret || !supabaseUrl || !supabaseSecret) {
    console.error("[supabase-keepalive] Required server configuration missing");
    return NextResponse.json({ ok: false, reason: "not_configured" }, { status: 503 });
  }

  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  try {
    const baseUrl = new URL(supabaseUrl);
    if (baseUrl.protocol !== "https:" || baseUrl.hostname !== "mpteambmrlflllfqtkmq.supabase.co") {
      return NextResponse.json({ ok: false, reason: "project_mismatch" }, { status: 503 });
    }

    const url = new URL("/rest/v1/crm_tenants", baseUrl);
    url.searchParams.set("select", "id");
    url.searchParams.set("limit", "1");
    const res = await fetch(url, {
      headers: { apikey: supabaseSecret, "cache-control": "no-cache" },
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      console.error("[supabase-keepalive] Query failed", res.status);
      return NextResponse.json({ ok: false, reason: "query_failed" }, { status: 502 });
    }
    return NextResponse.json({ ok: true });
  } catch {
    console.error("[supabase-keepalive] Query failed");
    return NextResponse.json({ ok: false }, { status: 502 });
  }
}
