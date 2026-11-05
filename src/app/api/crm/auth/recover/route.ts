import { NextRequest } from "next/server";
import { privateJson, supabaseSettings } from "@/lib/crm/supabase-server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The response does not disclose whether a user exists. Supabase handles its own email rate limits.
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return privateJson({error:"forbidden"},403);
  if (!request.headers.get("content-type")?.includes("application/json")) return privateJson({error:"json_required"},415);
  const length=Number(request.headers.get("content-length")??"0");
  if (length>4096) return privateJson({error:"request_too_large"},413);
  let value:unknown;
  try { value=await request.json(); } catch { return privateJson({error:"invalid_json"},400); }
  const email=value && typeof value==="object" && "email" in value && typeof value.email==="string"
    ? value.email.trim() : "";
  if (email.length>254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return privateJson({error:"invalid_email"},400);
  try {
    const {url,key}=supabaseSettings();
    const redirectTo=new URL("/reset-password",request.nextUrl.origin).toString();
    const response=await fetch(url+"/auth/v1/recover?redirect_to="+encodeURIComponent(redirectTo),{
      method:"POST",headers:{apikey:key,"Content-Type":"application/json"},
      body:JSON.stringify({email}),cache:"no-store",signal:AbortSignal.timeout(9000)
    });
    if(response.status===429) return privateJson({error:"rate_limited"},429);
    // Never leak user existence or the provider's detailed authentication errors.
    if(!response.ok && response.status>=500) return privateJson({error:"recovery_unavailable"},503);
    return privateJson({ok:true});
  } catch { return privateJson({error:"recovery_unavailable"},503); }
}
