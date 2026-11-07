import { NextRequest } from "next/server";
import { requireTenantFeature } from "@/lib/crm/plans";
import { authorizeCrmTenant, crmServiceConfig } from "@/lib/crm/tenant-access";
import { isAllowedOrigin, privateJson, supabaseRows, supabaseSettings } from "@/lib/crm/supabase-server";
export const runtime="nodejs";
export const dynamic="force-dynamic";
type Article={id:string;title:string;body:string;status:string;updated_at:string};
type Operator={id:string|null;token:string;isMaster:boolean};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function valid(value:unknown,min:number,max:number):value is string {
  return typeof value==="string"&&value.trim().length>=min&&value.length<=max;
}
async function readRows<T>(path:string,operator:Operator):Promise<T> {
  if(!operator.isMaster)return supabaseRows<T>(path,operator.token);
  const {url,key}=crmServiceConfig();
  const response=await fetch(url+"/rest/v1/"+path,{headers:{apikey:key,Authorization:"Bearer "+key},cache:"no-store",signal:AbortSignal.timeout(7000)});
  if(!response.ok)throw new Error("knowledge_unavailable");
  return await response.json() as T;
}
function checkOrigin(request:NextRequest) {
  return isAllowedOrigin(request.headers.get("origin"), request.url);
}
async function write(path:string,method:"POST"|"PATCH",operator:Operator,values:object) {
  const {url,key}=operator.isMaster?crmServiceConfig():supabaseSettings();
  return fetch(url+"/rest/v1/"+path,{
    method,cache:"no-store",signal:AbortSignal.timeout(8000),
    headers:{apikey:key,Authorization:"Bearer "+(operator.isMaster?key:operator.token),"Content-Type":"application/json",Prefer:"return=representation"},
    body:JSON.stringify(values)
  });
}
export async function GET(request:NextRequest) {
  const tenant=request.nextUrl.searchParams.get("tenant")??"";
  if(!UUID.test(tenant))return privateJson({error:"invalid_tenant"},400);
  try {
    const access=await authorizeCrmTenant(request,tenant);
    if(!access)return privateJson({error:"tenant_forbidden"},403);
    const featureGuard = await requireTenantFeature(tenant, "ai_chat");
    if (!featureGuard.allowed) return privateJson({error:featureGuard.errorCode,state:featureGuard.state,message:featureGuard.message},featureGuard.statusHttp);
    const operator={id:access.operatorId,token:access.token,isMaster:access.isMaster};
    const rows=await readRows<Article[]>(
      "crm_knowledge_articles?select=id,title,body,status,updated_at&tenant_id=eq."+tenant+"&order=updated_at.desc&limit=100",
      operator);
    return privateJson({articles:rows,limited:rows.length===100});
  }catch{return privateJson({error:"knowledge_unavailable"},503);}
}
export async function POST(request:NextRequest) {
  if(!checkOrigin(request))return privateJson({error:"origin_forbidden"},403);
  if(!request.headers.get("content-type")?.includes("application/json"))return privateJson({error:"json_required"},415);
  if(Number(request.headers.get("content-length")??0)>22000)return privateJson({error:"payload_too_large"},413);
  let data:unknown;
  try{data=await request.json();}catch{return privateJson({error:"invalid_json"},400);}
  const payload=data&&typeof data==="object"?data as Record<string,unknown>:{};
  if(!UUID.test(String(payload.tenantId??""))||!valid(payload.title,3,200)||!valid(payload.body,1,20000))
    return privateJson({error:"invalid_article"},400);
  const articleStatus=["draft","published","archived"].includes(String(payload.status??""))
    ? String(payload.status)
    : "published";
  try {
    const access=await authorizeCrmTenant(request,String(payload.tenantId));
    if(!access)return privateJson({error:"tenant_forbidden"},403);
    const featureGuard = await requireTenantFeature(String(payload.tenantId), "ai_chat");
    if (!featureGuard.allowed) return privateJson({error:featureGuard.errorCode,state:featureGuard.state,message:featureGuard.message},featureGuard.statusHttp);
    const operator={id:access.operatorId,token:access.token,isMaster:access.isMaster};
    const response=await write("crm_knowledge_articles","POST",operator,{
      tenant_id:payload.tenantId,title:(payload.title as string).trim(),
      body:(payload.body as string).trim(),status:articleStatus,created_by:operator.id
    });
    if(!response.ok)return privateJson({error:"knowledge_denied"},403);
    const added=await response.json() as {id:string}[];
    if(added.length!==1)return privateJson({error:"knowledge_unconfirmed"},503);
    return privateJson({created:true,id:added[0].id,status:articleStatus},201);
  }catch{return privateJson({error:"knowledge_service_unavailable"},503);}
}
export async function PATCH(request:NextRequest) {
  if(!checkOrigin(request))return privateJson({error:"origin_forbidden"},403);
  if(!request.headers.get("content-type")?.includes("application/json"))return privateJson({error:"json_required"},415);
  if(Number(request.headers.get("content-length")??0)>22000)return privateJson({error:"payload_too_large"},413);
  let data:unknown;
  try{data=await request.json();}catch{return privateJson({error:"invalid_json"},400);}
  const payload=data&&typeof data==="object"?data as Record<string,unknown>:{};
  if(!UUID.test(String(payload.tenantId??""))||!UUID.test(String(payload.id??""))||
     !valid(payload.title,3,200)||!valid(payload.body,1,20000)||
     !["draft","published","archived"].includes(String(payload.status??"")))
    return privateJson({error:"invalid_article"},400);
  try {
    const tenant=String(payload.tenantId),id=String(payload.id);
    const access=await authorizeCrmTenant(request,tenant);
    if(!access)return privateJson({error:"tenant_forbidden"},403);
    const featureGuard = await requireTenantFeature(String(payload.tenantId), "ai_chat");
    if (!featureGuard.allowed) return privateJson({error:featureGuard.errorCode,state:featureGuard.state,message:featureGuard.message},featureGuard.statusHttp);
    const operator={id:access.operatorId,token:access.token,isMaster:access.isMaster};
    const existing=await readRows<{id:string}[]>(
      "crm_knowledge_articles?select=id&id=eq."+id+"&tenant_id=eq."+tenant+"&limit=1",operator);
    if(!existing.length)return privateJson({error:"not_found"},404);
    const response=await write("crm_knowledge_articles?id=eq."+id+"&tenant_id=eq."+tenant,
      "PATCH",operator,{title:(payload.title as string).trim(),body:(payload.body as string).trim(),
        status:payload.status,updated_at:new Date().toISOString()});
    if(!response.ok)return privateJson({error:"knowledge_denied"},403);
    const updated=await response.json() as {id:string}[];
    if(updated.length!==1)return privateJson({error:"knowledge_denied"},403);
    return privateJson({updated:true});
  }catch{return privateJson({error:"knowledge_service_unavailable"},503);}
}
