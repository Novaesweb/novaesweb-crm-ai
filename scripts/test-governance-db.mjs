import {spawn} from "node:child_process";
import fs from "node:fs/promises";
import assert from "node:assert/strict";
const container = process.env.CRM_GOVERNANCE_TEST_CONTAINER || "novaesweb-governance-test-"+Date.now();
const external = Boolean(process.env.CRM_GOVERNANCE_TEST_CONTAINER);
function run(args,input="") {
 return new Promise((resolve,reject)=>{
  const p=spawn("docker",args,{windowsHide:true,stdio:["pipe","pipe","pipe"]});let out="",err="";
  p.stdout.on("data",b=>out+=b);p.stderr.on("data",b=>err+=b);
  p.on("error",reject);p.on("close",code=>code===0?resolve(out.trim()):reject(new Error(err||out)));
  p.stdin.end(input);
 });
}
const query = sql=>run(["exec","-i",container,"psql","-h","127.0.0.1","-U","postgres","-At","-v","ON_ERROR_STOP=1"],sql);
const A="11111111-1111-4111-8111-111111111111",B="22222222-2222-4222-8222-222222222222";
const owner="33333333-3333-4333-8333-333333333333",op1="44444444-4444-4444-8444-444444444444",op2="55555555-5555-4555-8555-555555555555";
const plan={planId:"crm-start",name:"CRM Start",quotaLimit:1,maxOperators:2,maxWhatsappConnections:1,status:"paid",autoBlock:false,contractedPlan:{quotaLimit:1,maxOperators:2,maxWhatsappConnections:1,features:["ai_chat","human_handoff"]}};
const reserve=(phone,token)=>"select public.crm_reserve_attendance('"+A+"','"+phone.repeat(64)+"','loja_fixture','"+token+"',1,0);";
try {
 if(!external) await run(["run","--detach","--rm","--name",container,"--network","none","--env","POSTGRES_HOST_AUTH_METHOD=trust","postgres:15"]);
 for(let i=0;i<30;i++){try{await query("select 1;");break;}catch(e){if(i===29)throw e;await new Promise(r=>setTimeout(r,200));}}
 await query("create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema auth to authenticated,service_role;");
 for(const f of ["20261104224506_crm_tenant_operational_foundation.sql","20261104231721_crm_complete_module_foundation.sql","20261105021618_crm_ai_usage_reporting_foundation.sql"])
  await query(await fs.readFile(new URL("../supabase/migrations/"+f,import.meta.url),"utf8"));
 await query("grant all on all tables in schema public to service_role;");
 await query(await fs.readFile(new URL("../supabase/migrations/20261107135335_crm_atomic_plan_governance.sql",import.meta.url),"utf8"));
 await query("insert into auth.users(id)values('"+owner+"'),('"+op1+"'),('"+op2+"');insert into crm_tenants(id,name,status)values('"+A+"','Fixture A','active'),('"+B+"','Fixture B','active');"+
 "insert into crm_tenant_settings(tenant_id,business_description)values('"+A+"','"+JSON.stringify({plan,storeInfo:"preserve",usageCounters:{trialUsed:0}})+"'),('"+B+"','"+JSON.stringify({plan})+"');"+
 "insert into crm_channels(tenant_id,instance_name,status)values('"+A+"','loja_fixture','connected'),('"+A+"','loja_fixture_2','connected'),('"+B+"','loja_other','connected');"+
 "insert into crm_tenant_memberships(tenant_id,user_id,role)values('"+A+"','"+owner+"','owner'),('"+B+"','"+op2+"','owner');");
 const t1="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",t2="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
 // Independent DB sessions compete for the final vacancy, not JS serialization.
 const attempts=await Promise.all([query(reserve("a",t1)),query(reserve("b",t2))]);
 const entries=attempts.map(s=>JSON.parse(s));assert.equal(entries.filter(x=>x.allowed).length,1);
 const token=entries[0].allowed?t1:t2;
 assert.equal(await query("select used from crm_attendance_usage where tenant_id='"+A+"';"),"0","reservation must not charge");
 await query("select crm_dispatch_attendance('"+A+"','"+token+"','loja_fixture',1);select crm_commit_attendance('"+A+"','"+token+"');select crm_commit_attendance('"+A+"','"+token+"');");
 assert.equal(await query("select used from crm_attendance_usage where tenant_id='"+A+"';"),"1","commit must be idempotent");
 assert.equal(JSON.parse(await query(reserve("c","cccccccc-cccc-4ccc-8ccc-cccccccccccc"))).allowed,false);
 // No Redis exists in this test: persisted quota still denies a new window.
 const phone=entries[0].allowed?"a":"b";
 const active=JSON.parse(await query(reserve(phone,"dddddddd-dddd-4ddd-8ddd-dddddddddddd")));assert.equal(active.allowed,true);assert.equal(active.newWindow,false);
 await query("select crm_release_attendance('"+A+"','dddddddd-dddd-4ddd-8ddd-dddddddddddd');");
 const add=user=>query("select crm_add_operator_membership('"+A+"','"+user+"','agent',2);");
 const memberResults=await Promise.allSettled([add(op1),add(op2)]);assert.equal(memberResults.filter(r=>r.status==="fulfilled").length,1);
 assert.equal(await query("select count(*) from crm_tenant_memberships where tenant_id='"+A+"' and is_active;"),"2");
 await query("select crm_enforce_operator_limit('"+A+"',1);");
 assert.equal(await query("select count(*) from crm_tenant_memberships where tenant_id='"+A+"' and is_active;"),"1");
 assert.equal(await query("select count(*) from crm_tenant_memberships where tenant_id='"+A+"';"),"2","downgrade preserves membership history");
 await query("set role authenticated;set request.jwt.claim.sub='"+owner+"';");
 assert.equal(await query("set role authenticated;set request.jwt.claim.sub='"+owner+"';select count(*) from crm_tenants where id='"+B+"';"),"SET\nSET\n0");
 const other=await query("set role authenticated;set request.jwt.claim.sub='"+op2+"';select count(*) from crm_tenants where id='"+A+"';");assert.ok(other.endsWith("\n0"),"other company cannot see A");
 await assert.rejects(query("set role authenticated;select crm_commit_attendance('"+A+"','"+token+"');"),/permission denied/);
 await assert.rejects(query("set role authenticated;select * from crm_attendance_usage;"),/permission denied/);
 // Plan replacement cannot overwrite simultaneous settings fields.
 await Promise.all([query("select crm_patch_tenant_config('"+A+"','{\"quickReplies\":[]}');"),query("select crm_replace_plan('"+A+"','"+JSON.stringify({...plan,quotaLimit:2})+"');")]);
 assert.equal(await query("select business_description::jsonb->>'storeInfo' from crm_tenant_settings where tenant_id='"+A+"';"),"preserve");
 assert.equal(await query("select business_description::jsonb?'quickReplies' from crm_tenant_settings where tenant_id='"+A+"';"),"t");
 // Upgrade approval uses the exact persisted request and target, exactly once.
 const premium={...plan,planId:"crm-premium",name:"CRM Premium",quotaLimit:1500,maxOperators:5,maxWhatsappConnections:5,contractedPlan:{quotaLimit:1500,maxOperators:5,maxWhatsappConnections:5,features:["ai_chat","human_handoff"]}};
 await query("select crm_patch_tenant_config('"+A+"','{\"upgradeRequests\":[{\"id\":\"request-premium\",\"targetPlanId\":\"crm-premium\",\"status\":\"pending\"}]}');");
 const resolve=(request,target)=>"select crm_resolve_upgrade('"+A+"','"+request+"','approved','"+JSON.stringify(target)+"','fixture-master','');";
 await assert.rejects(query(resolve("wrong-request",premium)),/upgrade_not_pending/);
 await assert.rejects(query(resolve("request-premium",plan)),/invalid_upgrade_target/);
 await query(resolve("request-premium",premium));
 await assert.rejects(query(resolve("request-premium",premium)),/upgrade_not_pending/);
 assert.equal(await query("select business_description::jsonb->'plan'->>'planId' from crm_tenant_settings where tenant_id='"+A+"';"),"crm-premium");
 // Trial has a single lifetime period, independent of the calendar month.
 const trial={planId:"crm-trial",name:"Teste Grátis",isTrial:true,status:"trial",trialStartedAt:new Date().toISOString(),trialExpiresAt:new Date(Date.now()+86400000).toISOString(),maxOperators:1,maxWhatsappConnections:1,quotaLimit:100};
 await query("select crm_replace_plan('"+B+"','"+JSON.stringify(trial)+"');");
 const tr=JSON.parse(await query("select crm_reserve_attendance('"+B+"','"+("f".repeat(64))+"','loja_other','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',100,99,'trial');"));
 assert.equal(tr.period,"trial");assert.equal(tr.used,99);assert.equal(tr.allowed,true);
 await query("select crm_release_attendance('"+B+"','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee');");
 const exhausted=JSON.parse(await query("select crm_reserve_attendance('"+B+"','"+("e".repeat(64))+"','loja_other','ffffffff-ffff-4fff-8fff-ffffffffffff',100,100,'trial');"));assert.equal(exhausted.allowed,false);assert.equal(exhausted.reason,"quota_exceeded");
 await query("select crm_replace_plan('"+B+"','"+JSON.stringify({...trial,trialExpiresAt:new Date(Date.now()-1000).toISOString()})+"');");
 await assert.rejects(query("select crm_reserve_attendance('"+B+"','"+("d".repeat(64))+"','loja_other','ffffffff-ffff-4fff-8fff-ffffffffffff',100,0);"),/trial_expired/);
 console.log("PASS: isolated PostgreSQL migration, concurrent quota/operators, idempotent commit, durable limit, 24h window, downgrade history, cross-tenant RLS, private RPCs, atomic settings and trial period.");
} finally {
 if(!external)await run(["stop",container]).catch(()=>{});
}

