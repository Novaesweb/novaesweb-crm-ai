import { createHash } from "node:crypto";
import Redis from "ioredis";
import { NextRequest } from "next/server";
import { isAllowedOrigin, privateJson, verifyOperator } from "@/lib/crm/supabase-server";
import { authorizeAiLab, freeModelIds } from "@/lib/crm/ai-lab";
export const runtime="nodejs";
export const dynamic="force-dynamic";

async function underLimits(userId:string):Promise<boolean>{
 const url=process.env.CRM_REDIS_URL??"";
 if(!/^rediss?:\/\//.test(url))throw new Error("lab_rate_limit_unavailable");
 const redis=new Redis(url,{lazyConnect:true,connectTimeout:3000,maxRetriesPerRequest:1});
 const key=createHash("sha256").update(userId).digest("hex");
 try{
  await redis.connect();
  const minute="crm:ai-lab:minute:"+key+":"+Math.floor(Date.now()/60000);
  const day="crm:ai-lab:day:"+key+":"+new Date().toISOString().slice(0,10);
  const results=await redis.multi().incr(minute).expire(minute,120)
   .incr(day).expire(day,86400*2).exec();
  if(!results||results.some(r=>r[0]))throw new Error("lab_rate_limit_unavailable");
  return Number(results[0][1])<=5&&Number(results[2][1])<=20;
 }finally{redis.disconnect();}
}

export async function POST(req:NextRequest){
 if(!isAllowedOrigin(req.headers.get("origin"), req.url))return privateJson({error:"origin_forbidden"},403);
 if(!req.headers.get("content-type")?.includes("application/json"))return privateJson({error:"json_required"},415);
 if(Number(req.headers.get("content-length")??0)>1500)return privateJson({error:"too_large"},413);
 try{
  const user=await verifyOperator();
  if(!user)return privateJson({error:"unauthorized"},401);
  const admin=await authorizeAiLab();
  if(!admin)return privateJson({error:"forbidden"},403);
  if(process.env.CRM_AI_LAB_TEST_ENABLED!=="true")return privateJson({error:"test_disabled"},403);
  let input:unknown;
  try{input=await req.json();}catch{return privateJson({error:"invalid_json"},400);}
  const body=input&&typeof input==="object"?input as Record<string,unknown>:{};
  const model=typeof body.model==="string"?body.model:"";
  const question=typeof body.question==="string"?body.question.trim():"";
  if(!freeModelIds().includes(model)||question.length<3||question.length>500)
    return privateJson({error:"invalid_or_unapproved_model"},400);
  const rawUrl=process.env.AI_OPENAI_BASE_URL??"";
  const key=process.env.AI_API_KEY??"";
  const url=new URL(rawUrl);
  if(!["http:","https:"].includes(url.protocol)||!key||url.username||url.password||url.search||url.hash)
    return privateJson({error:"gateway_not_configured"},503);
  if(!(await underLimits(admin.id)))return privateJson({error:"test_quota_exceeded"},429);
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),15000);
  try{
   const res=await fetch(url.toString().replace(/\/$/,"")+"/chat/completions",{
    method:"POST",cache:"no-store",signal:controller.signal,
    headers:{"Content-Type":"application/json",Authorization:"Bearer "+key},
    body:JSON.stringify({model,temperature:0.2,max_tokens:200,messages:[
     {role:"system",content:"Teste técnico de atendimento NovaesWeb em português. Não invente preços nem informações não fornecidas. Responda de modo curto. Nenhum WhatsApp será enviado."},
     {role:"user",content:question}
    ]})
   });
   if(!res.ok)return privateJson({error:res.status===429?"provider_rate_limited":"model_test_failed",providerStatus:res.status},503);
   const result=await res.json() as {model?:unknown;choices?:{message?:{content?:unknown}}[];usage?:{prompt_tokens?:number;completion_tokens?:number}};
   const answer=result.choices?.[0]?.message?.content;
   if(typeof answer!=="string"||!answer.trim())return privateJson({error:"empty_model_response"},503);
   return privateJson({
    answer:answer.trim().slice(0,1600),
    requestedModel:model,
    reportedModel:typeof result.model==="string"?result.model:null,
    tokens:result.usage?{input:result.usage.prompt_tokens??null,output:result.usage.completion_tokens??null}:null,
    whatsappSent:false,
    costVerified:false
   });
  }finally{clearTimeout(timer);}
 }catch{return privateJson({error:"lab_unavailable"},503);}
}
