import { NextRequest } from "next/server";
import { privateJson, supabaseSettings } from "@/lib/crm/supabase-server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request:NextRequest) {
  const origin=request.headers.get("origin");
  if(origin && origin!==request.nextUrl.origin) return privateJson({error:"forbidden"},403);
  if(!request.headers.get("content-type")?.includes("application/json")) return privateJson({error:"json_required"},415);
  if(Number(request.headers.get("content-length")??"0")>8500) return privateJson({error:"request_too_large"},413);
  let value:unknown;
  try {value=await request.json();}catch{return privateJson({error:"invalid_json"},400);}
  if(!value||typeof value!=="object")return privateJson({error:"invalid_request"},400);
  const params=value as Record<string,unknown>;
  const token=typeof params.token==="string"?params.token:"";
  const password=typeof params.password==="string"?params.password:"";
  if(token.length<30 || token.length>4096 || password.length<8 || password.length>256)
    return privateJson({error:"invalid_request"},400);
  try{
    const {url,key}=supabaseSettings();
    // Only a Supabase-issued, valid access token can reset that account's password.
    const verify=await fetch(url+"/auth/v1/user",{
      headers:{apikey:key,Authorization:"Bearer "+token},cache:"no-store",signal:AbortSignal.timeout(9000)
    });
    if(!verify.ok) return privateJson({error:"invalid_or_expired_link"},401);
    const response=await fetch(url+"/auth/v1/user",{
      method:"PUT",headers:{apikey:key,Authorization:"Bearer "+token,"Content-Type":"application/json"},
      body:JSON.stringify({password}),cache:"no-store",signal:AbortSignal.timeout(9000)
    });
    if(!response.ok)return privateJson({error:"password_update_failed"},response.status===429?429:400);
    return privateJson({ok:true});
  }catch{return privateJson({error:"recovery_unavailable"},503);}
}
