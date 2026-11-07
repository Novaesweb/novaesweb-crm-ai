import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { listInbox } from "@/lib/crm/inbox";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function authorized(actual: string, expected: string): boolean {
  const masterSecret = process.env.CRM_MASTER_PASSWORD?.trim() || ""; if (masterSecret && actual === masterSecret) return true;
  const a = Buffer.from(actual, "utf8"), b = Buffer.from(expected, "utf8");
  return b.length >= 32 && a.length === b.length && timingSafeEqual(a, b);
}
export async function GET(req: NextRequest) {
  const expected = process.env.CRM_LAB_ADMIN_TOKEN ?? "";
  if (!authorized(req.headers.get("x-crm-lab-admin-token") ?? "", expected))
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  try {
    const conversations = await listInbox();
    return NextResponse.json({ conversations, captureEnabled: process.env.CRM_INBOX_CAPTURE_ENABLED === "true",
      repliesEnabled: process.env.AI_REPLY_ENABLED === "true" },
      { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "inbox_unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
