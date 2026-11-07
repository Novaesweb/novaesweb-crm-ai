import { NextRequest } from "next/server";
import { isAllowedOrigin, privateJson, supabaseRows, supabaseSettings, verifyOperator } from "@/lib/crm/supabase-server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Staff = {role:string;enabled:boolean};
export async function POST(request:NextRequest) {
  const origin=request.headers.get("origin");
  if(!isAllowedOrigin(origin, request.url)) return privateJson({error:"origin_forbidden"},403);
  if(!request.headers.get("content-type")?.includes("application/json"))return privateJson({error:"json_required"},415);
  if(Number(request.headers.get("content-length")??0)>1024)return privateJson({error:"payload_too_large"},413);
  let body:unknown;
  try { body=await request.json(); } catch {return privateJson({error:"invalid_json"},400);}
  const name=body&&typeof body==="object"&&"name" in body&&typeof body.name==="string"?body.name.trim():"";
  if(name.length<2||name.length>160||/[\u0000-\u001f\u007f]/.test(name)) return privateJson({error:"invalid_name"},400);
  try {
    const operator=await verifyOperator();
    if(!operator)return privateJson({error:"unauthorized"},401);
    const staff=await supabaseRows<Staff[]>(
      "platform_staff?select=role,enabled&user_id=eq."+encodeURIComponent(operator.id)+"&limit=2",operator.token);
    if(staff.length!==1||!staff[0].enabled||!["MASTER","ADMINISTRADOR"].includes(staff[0].role))
      return privateJson({error:"forbidden"},403);
    const {url}=supabaseSettings();
    const secret = (process.env.CRM_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY)?.trim() ?? "";
    if(secret.length<30)return privateJson({error:"backend_not_configured"},503);
    const response=await fetch(url+"/rest/v1/rpc/crm_admin_create_tenant",{
      method:"POST",cache:"no-store",signal:AbortSignal.timeout(8000),
      headers:{apikey:secret,Authorization:"Bearer "+secret,"Content-Type":"application/json"},
      body:JSON.stringify({p_name:name,p_actor:operator.id})
    });
    if(!response.ok)return privateJson({error:"tenant_create_failed"},503);
    const id=await response.json() as unknown;
    if(typeof id!=="string"||!/^[a-f0-9-]{36}$/i.test(id))return privateJson({error:"tenant_create_unconfirmed"},503);
    return privateJson({created:true,id,status:"inactive"},201);
  } catch { return privateJson({error:"tenant_service_unavailable"},503); }
}
