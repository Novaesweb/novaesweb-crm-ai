import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { NextRequest } from "next/server";
function handler() {
 const secret="fixture-webhook-secret-".repeat(3);
 const dependencies:Record<string,unknown>={
  "node:crypto":{timingSafeEqual:(a:Buffer,b:Buffer)=>a.equals(b)},
  "next/server":{NextRequest,NextResponse:{json:Response.json.bind(Response)}},
  ioredis:class {},
  "@/lib/agent/config":{getAgentConfig:()=>({sendEnabled:false})},
  "@/lib/agent/processor":{processWebhook:async()=>({status:"ignored"})},
  "@/lib/agent/parse":{parseIncoming:()=>null},
  "@/lib/crm/inbox":{}, "@/lib/crm/supabase-ingest":{}, "@/lib/crm/outbound-guard":{},
  "@/lib/crm/plans":{}, "@/lib/crm/whatsapp-slots":{},
 };
 const fixtureModule={exports:{} as {POST:(r:NextRequest)=>Promise<Response>}};
 const code=ts.transpileModule(fs.readFileSync("src/app/api/evolution/webhook/route.ts","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(code,{module:fixtureModule,exports:fixtureModule.exports,require:(name:string)=>{if(!(name in dependencies))throw Error("unmocked "+name);return dependencies[name];},Buffer,Response,console,process:{env:{CRM_WEBHOOK_SECRET:secret,EVOLUTION_API_KEY:"fixture-evolution-key"}}});
 return {post:fixtureModule.exports.POST,secret};
}
test("webhook rejects recognizable unsigned payloads and an explicitly incorrect header",async()=>{
 const f=handler();const body=JSON.stringify({event:"messages.upsert",instance:"loja_fixture"});
 const req=(headers:Record<string,string>={},query="")=>new NextRequest("http://localhost/api/evolution/webhook"+query,{method:"POST",headers:{"Content-Type":"application/json",...headers},body});
 assert.equal((await f.post(req())).status,401);
 assert.equal((await f.post(req({"x-crm-webhook-secret":"wrong"},"?secret="+f.secret))).status,401);
 assert.equal((await f.post(req({"x-crm-webhook-secret":f.secret}))).status,200);
});
