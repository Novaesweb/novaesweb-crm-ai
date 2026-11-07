import { NextRequest } from "next/server";
import { isAllowedOrigin, privateJson, supabaseRows, supabaseSettings, verifyOperator } from "@/lib/crm/supabase-server";
export const runtime="nodejs";
export const dynamic="force-dynamic";
type Staff={role:string;enabled:boolean};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function POST(request:NextRequest) {
  if(!isAllowedOrigin(request.headers.get("origin"), request.url)) return privateJson({error:"origin_forbidden"},403);
  if(!request.headers.get("content-type")?.includes("application/json"))return privateJson({error:"json_required"},415);
  if(Number(request.headers.get("content-length")??0)>1024)return privateJson({error:"payload_too_large"},413);
  let body:unknown;
  try{body=await request.json();}catch{return privateJson({error:"invalid_json"},400);}
  const data=body&&typeof body==="object"?body as Record<string,unknown>:{};
  const id=typeof data.tenantId==="string"?data.tenantId:"";
  const suspend=data.suspend;
  const confirmed=data.confirm===true;
  if(!UUID.test(id)||typeof suspend!=="boolean"||!confirmed)return privateJson({error:"invalid_action"},400);
  try {
    const operator=await verifyOperator();
    if(!operator)return privateJson({error:"unauthorized"},401);
    const staff=await supabaseRows<Staff[]>(
      "platform_staff?select=role,enabled&user_id=eq."+operator.id+"&limit=2",operator.token);
    if(staff.length!==1||!staff[0].enabled||!["MASTER","ADMINISTRADOR"].includes(staff[0].role))
      return privateJson({error:"forbidden"},403);
    const {url}=supabaseSettings();
    const key = (process.env.CRM_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY)?.trim() ?? "";
    if(key.length<30)return privateJson({error:"backend_not_configured"},503);
    const response=await fetch(url+"/rest/v1/rpc/crm_admin_set_tenant_suspension",{
      method:"POST",cache:"no-store",signal:AbortSignal.timeout(9000),
      headers:{apikey:key,Authorization:"Bearer "+key,"Content-Type":"application/json"},
      body:JSON.stringify({p_tenant:id,p_actor:operator.id,p_suspend:suspend})
    });
    if(!response.ok)return privateJson({error:"tenant_suspension_failed"},409);
    const status=await response.json() as unknown;
    return privateJson({tenantId:id,status});
  } catch { return privateJson({error:"suspension_unavailable"},503); }
}
