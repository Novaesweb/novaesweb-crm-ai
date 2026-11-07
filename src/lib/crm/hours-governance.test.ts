import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import {NextRequest} from "next/server";
const TENANT="11111111-1111-4111-8111-111111111111";
for(const state of ["locked_by_plan","maintenance"]){
 test("advanced hours deny "+state+" before any configuration write",async()=>{
  let writes=0;
  const plan={isSuspended:false,allowedFeatures:["ai_chat","business_hours_basic"],featureStates:{ai_chat:{state:"allowed"},business_hours_basic:{state:"allowed"},business_hours:{state}}};
  const dependencies:Record<string,unknown>={
   "next/server":{NextRequest},
   ioredis:class{},
   "@/lib/crm/tenant-access":{authorizeCrmTenant:async()=>({operatorId:null}),crmFeatureAllowed:(_p:unknown,f:string)=>f!=="business_hours",patchCrmConfig:async()=>{writes++;}},
   "@/lib/crm/supabase-server":{privateJson:(b:unknown,s=200)=>Response.json(b,{status:s}),isAllowedOrigin:()=>true},
   "@/lib/crm/plans":{getEffectiveTenantPlan:async()=>plan,requireTenantFeature:async(_t:string,f:string)=>({allowed:f!=="business_hours",effectivePlan:plan,state:f==="business_hours"?state:"allowed",statusHttp:state==="maintenance"?503:403})},
   "@/lib/crm/whatsapp-slots":{}, "@/lib/agent/processor":{},
  };
  const fixtureModule={exports:{} as {POST:(r:NextRequest)=>Promise<Response>}};
  const code=ts.transpileModule(readFileSync("src/app/api/crm/operator/ai-settings/route.ts","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  vm.runInNewContext(code,{module:fixtureModule,exports:fixtureModule.exports,require:(n:string)=>{if(!(n in dependencies))throw Error(n);return dependencies[n];},Response,console,process:{env:{}},fetch:async()=>{writes++;throw Error("unexpected fetch");}});
  const request=new NextRequest("http://fixture.invalid/api/crm/operator/ai-settings",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({tenantId:TENANT,operatingHours:{schedule:{seg:{hasBreak:true}}}})});
  assert.equal((await fixtureModule.exports.POST(request)).status,state==="maintenance"?503:403);assert.equal(writes,0);
 });
}
