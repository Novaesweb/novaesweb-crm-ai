import { test } from "node:test";
import assert from "node:assert/strict";
import { parseIncoming } from "./parse";

const sample = {
  event: "messages.upsert", instance: "crmtest",
  data: { key: { id: "ABC1", remoteJid: "5511999998888@s.whatsapp.net", fromMe: false }, message: { conversation: "Qual o horário?" } },
};
test("accept authorized-shape incoming individual text", () => {
  const parsed = parseIncoming(sample);
  assert.deepEqual(parsed, { id: "ABC1", instance: "crmtest", remoteJid: "5511999998888@s.whatsapp.net", number: "5511999998888", text: "Qual o horário?", pushName: undefined });
});
test("ignore self messages, groups, non-message events and nontext", () => {
  assert.equal(parseIncoming({ ...sample, data: { ...sample.data, key: { ...sample.data.key, fromMe: true } } }), null);
  assert.equal(parseIncoming({ ...sample, data: { ...sample.data, key: { ...sample.data.key, remoteJid: "120123456789@g.us" } } }), null);
  assert.equal(parseIncoming({ ...sample, event: "messages.update" }), null);
  assert.equal(parseIncoming({ ...sample, data: { ...sample.data, message: { imageMessage: {} } } }), null);
});
test("accept text extendedMessage and ignore oversized content", () => {
  const data = { ...sample.data, message: { extendedTextMessage: { text: "Bom dia" } } };
  assert.equal(parseIncoming({ ...sample, data })?.text, "Bom dia");
  assert.equal(parseIncoming({ ...sample, data: { ...sample.data, message: { conversation: "x".repeat(1601) } } }), null);
});
