import { NextRequest } from "next/server";
import { requireTenantFeature } from "@/lib/crm/plans";
import { authorizeCrmTenant } from "@/lib/crm/tenant-access";
import { isAllowedOrigin, privateJson, supabaseSettings } from "@/lib/crm/supabase-server";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function POST(request:NextRequest) {
  const origin=request.headers.get("origin");
  if (!isAllowedOrigin(origin, request.url)) return privateJson({error:"forbidden"},403);
  if(!request.headers.get("content-type")?.includes("application/json"))return privateJson({error:"json_required"},415);
  if(Number(request.headers.get("content-length")??0)>1500)return privateJson({error:"request_too_large"},413);
  let body:unknown;
  try { body=await request.json(); } catch { return privateJson({error:"invalid_json"},400); }
  const input=body && typeof body==="object"?body as Record<string,unknown>:{};
  const tenant=typeof input.tenantId==="string"?input.tenantId:"";
  const phone=typeof input.phone==="string"?input.phone.replace(/\D/g,""):"";
  const name=typeof input.name==="string"?input.name.trim().slice(0,160):null;
  if (!UUID.test(tenant) || phone.length<10 || phone.length>15) return privateJson({error:"invalid_input"},400);
  try {
    const access=await authorizeCrmTenant(request,tenant,["owner","admin","agent"]);
    if (!access) return privateJson({error:"forbidden"},403);
    const featureGuard = await requireTenantFeature(tenant, "human_handoff");
    if (!featureGuard.allowed) return privateJson({ error: featureGuard.errorCode, state: featureGuard.state, message: featureGuard.message }, featureGuard.statusHttp);
    const {url}=supabaseSettings();
    const serviceKey=process.env.CRM_SUPABASE_SERVICE_ROLE_KEY??"";
    if (serviceKey.length<30) return privateJson({error:"crm_not_ready"},503);
    const rpc=await fetch(url+"/rest/v1/rpc/crm_create_contact",{
      method:"POST",headers:{apikey:serviceKey,Authorization:"Bearer "+serviceKey,"Content-Type":"application/json"},
      body:JSON.stringify({p_tenant:tenant,p_phone:phone,p_name:name}),cache:"no-store"
    });
    if (!rpc.ok) {
      if (rpc.status===409) return privateJson({error:"already_exists"},409);
      return privateJson({error:"insert_failed"},503);
    }
    const contactId=await rpc.json();
    return privateJson({created:true,id:contactId},201);
  } catch { return privateJson({error:"service_unavailable"},503); }
}
