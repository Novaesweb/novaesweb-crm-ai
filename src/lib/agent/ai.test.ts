import { test } from "node:test";
import assert from "node:assert/strict";
import { generateAnswer } from "./ai";
import type { AiConfig } from "./config";

const cfg: AiConfig = { aiUrl: "http://localhost:20128/v1", aiKey: "secret-hidden",
  aiModel: "route1", systemPrompt: "Horario confirmado: nao definido." };
test("uses explicitly configured fallback model on 429, never sends or exposes credentials", async () => {
  const old = process.env.AI_FALLBACK_MODELS;
  const previous = globalThis.fetch;
  const called: string[] = [];
  process.env.AI_FALLBACK_MODELS = "route2";
  globalThis.fetch = (async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as { model: string };
    called.push(body.model);
    if (body.model === "route1") return new Response("limite", { status: 429 });
    return Response.json({ choices: [{ message: { content: "Atendimento pronto." } }] });
  }) as typeof fetch;
  try {
    assert.equal(await generateAnswer("Ola", cfg, {allowFallback:true}), "Atendimento pronto.");
    assert.deepEqual(called, ["route1", "route2"]);
  } finally {
    globalThis.fetch = previous;
    if (old === undefined) delete process.env.AI_FALLBACK_MODELS;
    else process.env.AI_FALLBACK_MODELS = old;
  }
});
test("does not fallback on unauthorized key", async () => {
  const old = process.env.AI_FALLBACK_MODELS;
  const previous = globalThis.fetch;
  let calls = 0;
  process.env.AI_FALLBACK_MODELS = "route2";
  globalThis.fetch = (async () => { calls++; return new Response("auth", { status: 401 }); }) as typeof fetch;
  try {
    await assert.rejects(generateAnswer("Ola", cfg), /401/);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = previous;
    if (old === undefined) delete process.env.AI_FALLBACK_MODELS;
    else process.env.AI_FALLBACK_MODELS = old;
  }
});

test("Start never tries fallback even when the environment advertises other models",async()=>{
 const old=globalThis.fetch;const models:string[]=[];
 globalThis.fetch=async(_url,init)=>{models.push(JSON.parse(String(init?.body)).model);return new Response("unavailable",{status:429});};
 try{await assert.rejects(generateAnswer("Oi",cfg,{allowFallback:false,fallbackModel:"route2"}));assert.deepEqual(models,["route1"]);}finally{globalThis.fetch=old;}
});
