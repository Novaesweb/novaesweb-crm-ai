import assert from "node:assert/strict";
import test from "node:test";
import type Redis from "ioredis";
import { CATALOG_SCHEMA_VERSION, DEFAULT_PLANS, getEffectiveTenantPlan, getMasterPlans, requireTenantFeature, saveMasterPlan, type CrmPlan } from "./plans";
import { syncWhatsappChannelsForPlanLimit } from "./whatsapp-slots";

// Regression tests: all network and Redis activity is simulated; no real tenant is used.
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const start = DEFAULT_PLANS.find(p => p.id === "crm-start")!;
const business = DEFAULT_PLANS.find(p => p.id === "crm-business")!;
function memoryRedis(catalog: CrmPlan[] = DEFAULT_PLANS) {
 const values = new Map<string,string>([["crm:master:plans",JSON.stringify(catalog.map(p=>({...p,catalogSchemaVersion:CATALOG_SCHEMA_VERSION})))]]);
 const deleted:string[]=[];
 const redis={status:"ready",connect:async()=>undefined,disconnect:()=>undefined,get:async(k:string)=>values.get(k)??null,
 set:async(k:string,v:string)=>{values.set(k,v);return "OK";},del:async(k:string)=>{deleted.push(k);return values.delete(k)?1:0;},hdel:async()=>1,lpush:async()=>1,ltrim:async()=>"OK"};
 return {redis:redis as unknown as Redis,values,deleted};
}
type Setting={tenant_id:string;business_description:string};
async function fixture(run:(f:{settings:Setting[];calls:Array<{path:string;method:string;body:Record<string,unknown>}>;failChannels:()=>void})=>Promise<void>){
 const oldFetch=globalThis.fetch;const names=["CRM_SUPABASE_URL","CRM_SUPABASE_SERVICE_ROLE_KEY","CRM_ALERT_WEBHOOK_URL"];const old=names.map(n=>process.env[n]);
 process.env.CRM_SUPABASE_URL="https://governance-fixture.supabase.co";process.env.CRM_SUPABASE_SERVICE_ROLE_KEY="fixture-service-key-only-never-real";delete process.env.CRM_ALERT_WEBHOOK_URL;
 const settings:Setting[]=[{tenant_id:A,business_description:JSON.stringify({usageCounters:{trialUsed:17},plan:{planId:business.id,name:business.name,dueDate:"2099-12-01"}})},{tenant_id:B,business_description:JSON.stringify({plan:{planId:business.id,name:business.name,customQuotaOverride:777,exceptionReason:"Explicit fixture exception"}})}];
 const calls:Array<{path:string;method:string;body:Record<string,unknown>}>=[];let failure=false;
 globalThis.fetch=async(input,init)=>{const url=new URL(String(input));assert.equal(url.hostname,"governance-fixture.supabase.co");const method=init?.method||"GET";const body=init?.body?JSON.parse(String(init.body)):{};calls.push({path:url.pathname+url.search,method,body});
 if(url.pathname.endsWith("/crm_tenant_settings")&&method==="GET"){const id=url.searchParams.get("tenant_id")?.slice(3);return Response.json(id?settings.filter(s=>s.tenant_id===id):settings);}
 if(url.pathname.endsWith("/crm_tenants")&&method==="GET")return Response.json([{status:"active",name:"Fixture company"}]);
 if(url.pathname.endsWith("/rpc/crm_apply_due_plan"))return Response.json(JSON.parse(settings.find(s=>s.tenant_id===body.p_tenant)!.business_description));
 if(url.pathname.endsWith("/rpc/crm_replace_plan")){const row=settings.find(s=>s.tenant_id===body.p_tenant)!;const root=JSON.parse(row.business_description);root.plan=body.p_plan;row.business_description=JSON.stringify(root);return Response.json(root);}
 if(url.pathname.endsWith("/rpc/crm_enforce_operator_limit"))return Response.json({activeCount:1,pausedUserIds:[]});
 if(url.pathname.endsWith("/crm_channels")){if(method==="GET")return Response.json([{id:A,instance_name:"loja_fixture_3",status:"connected"}]);return failure?Response.json({}, {status:500}):Response.json([{id:A}]);}
 if(url.pathname.endsWith("/crm_attendance_usage")&&method==="GET")return Response.json([]);
 if(url.pathname.endsWith("/crm_usage_limits"))return method==="GET"?Response.json([{tenant_id:A}]):new Response(null,{status:204});
 if(url.pathname.endsWith("/crm_audit_events"))return new Response(null,{status:204});
 throw new Error(`Unexpected fixture request ${method} ${url.pathname}`);};
 try{await run({settings,calls,failChannels:()=>{failure=true;}});}finally{globalThis.fetch=oldFetch;names.forEach((n,i)=>old[i]===undefined?delete process.env[n]:process.env[n]=old[i]);}
}

test("immediate bulk publication propagates all limits, syncs channels/operators and preserves explicit exceptions",async()=>fixture(async f=>{
 const cache=memoryRedis();const result=await saveMasterPlan({...business,quotaLimit:700,maxOperators:2,maxWhatsappConnections:2},"apply","immediate","fixture_master",cache.redis);
 assert.equal(result.applied,true);assert.deepEqual(result.succeededTenants,[A,B]);
 for(const row of f.settings){const saved=JSON.parse(row.business_description);assert.equal(saved.plan.contractedPlan.maxWhatsappConnections,2);assert.equal(saved.plan.contractedPlan.maxOperators,2);assert.deepEqual(saved.plan.contractedPlan.features,business.features);}
 assert.equal(JSON.parse(f.settings[0].business_description).usageCounters.trialUsed,17);
 assert.deepEqual(f.calls.filter(c=>c.path.startsWith("/rest/v1/crm_usage_limits?")&&c.method==="PATCH").map(c=>c.body.monthly_model_requests),[700,777]);
 assert.equal(f.calls.filter(c=>c.path.startsWith("/rest/v1/crm_channels?")&&c.method==="PATCH").length,2);
 assert.equal(f.calls.filter(c=>c.path.endsWith("/rpc/crm_enforce_operator_limit")).length,2);assert.ok(cache.deleted.includes(`crm:tenant:effective_plan:${A}`));
}));

test("next_renewal UI alias creates next_cycle update and freezes old complete contract",async()=>fixture(async f=>{
 f.settings.splice(1);const cache=memoryRedis();const result=await saveMasterPlan({...business,quotaLimit:700,maxWhatsappConnections:2},"apply","next_renewal","fixture_master",cache.redis);
 assert.equal(result.applied,true);assert.deepEqual(result.succeededTenants,[A]);const root=JSON.parse(f.settings[0].business_description);assert.equal(root.plan.pendingPlanUpdate.quotaLimit,700);assert.equal(root.plan.pendingPlanUpdate.effectiveAt,"2099-12-01");
 const plan=await getEffectiveTenantPlan(A,f.settings[0].business_description,cache.redis);assert.equal(plan.quotaLimit,600);assert.equal(plan.maxWhatsappConnections,3);assert.equal(plan.isContractFrozen,true);
}));

test("frozen snapshot does not inherit catalog features or greater limits",async()=>{
 const cache=memoryRedis(DEFAULT_PLANS.map(p=>p.id===business.id?{...p,maxOperators:5,maxWhatsappConnections:5}:p));
 const plan=await getEffectiveTenantPlan(A,JSON.stringify({plan:{planId:business.id,contractedPlan:{quotaLimit:600,price:business.price,features:start.features,maxOperators:1,maxWhatsappConnections:1,version:1}}}),cache.redis);
 assert.equal(plan.maxWhatsappConnections,1);assert.equal(plan.maxOperators,1);assert.equal(plan.allowedFeatures.includes("commercial_tags"),false);
});

test("tenant lookup failure cannot grant or cache active Start access",async()=>fixture(async()=>{
 const cache=memoryRedis();globalThis.fetch=async()=>Response.json({}, {status:503});
 await assert.rejects(getEffectiveTenantPlan(A,cache.redis),/tenant_plan_lookup_failed|due_plan_lookup_failed/);await assert.rejects(requireTenantFeature(A,"ai_chat",cache.redis),/tenant_plan_lookup_failed|due_plan_lookup_failed/);assert.equal(cache.values.has(`crm:tenant:effective_plan:${A}`),false);
}));

test("catalog outage never restores broader default entitlements",async()=>{
 const cache=memoryRedis();cache.redis.get=async()=>{throw new Error("fixture_redis_down");};await assert.rejects(getMasterPlans(cache.redis),/plan_catalog_unavailable/);
});

test("failed channel pause is rejected instead of reporting success",async()=>fixture(async f=>{
 f.failChannels();await assert.rejects(syncWhatsappChannelsForPlanLimit(A,1,"https://governance-fixture.supabase.co","fixture-only"),/channel_sync_update_failed:500/);assert.equal(f.calls.some(c=>c.method==="DELETE"),false);
}));

test("bulk propagation reports a failed tenant when channel pause fails",async()=>fixture(async f=>{
 f.failChannels();f.settings.splice(1);const result=await saveMasterPlan({...business,maxWhatsappConnections:1},"apply","immediate","fixture_master",memoryRedis().redis);assert.equal(result.applied,false);assert.equal(result.succeededTenants.length,0);assert.equal(result.failedTenants[0].tenantId,A);
}));

test("guards and allowedFeatures both deny maintenance and suspended access",async()=>fixture(async f=>{
 f.settings.splice(1);const root=JSON.parse(f.settings[0].business_description);root.maintenanceFeatures=["commercial_tags"];f.settings[0].business_description=JSON.stringify(root);const cache=memoryRedis();
 const maintenance=await requireTenantFeature(A,"commercial_tags",cache.redis);assert.equal(maintenance.allowed,false);assert.equal(maintenance.statusHttp,503);assert.equal(maintenance.effectivePlan.allowedFeatures.includes("commercial_tags"),false);
 root.suspension={isSuspended:true};f.settings[0].business_description=JSON.stringify(root);const suspension=await requireTenantFeature(A,"ai_chat",cache.redis);assert.equal(suspension.allowed,false);assert.equal(suspension.statusHttp,403);
}));

test("invalid commercial limits and trial timestamps are refused",async()=>fixture(async()=>{
 const cache=memoryRedis();const initial=cache.values.get("crm:master:plans");await assert.rejects(saveMasterPlan({...business,maxWhatsappConnections:6},"apply","immediate","fixture_master",cache.redis),/invalid_plan_limits/);assert.equal(cache.values.get("crm:master:plans"),initial);
 await assert.rejects(getEffectiveTenantPlan(A,JSON.stringify({plan:{planId:"crm-trial",trialStartedAt:"garbage"}}),cache.redis),/invalid_trial_start/);
}));
