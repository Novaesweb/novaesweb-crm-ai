export type Incoming = { id: string; remoteJid: string; number: string; text: string; instance: string; pushName?: string };
type RecordLike = Record<string, unknown>;
const record = (value: unknown): RecordLike | null =>
  !!value && typeof value === "object" && !Array.isArray(value) ? value as RecordLike : null;

export function parseIncoming(payload: unknown): Incoming | null {
  const body = record(payload);
  if (!body || !["messages.upsert", "MESSAGES_UPSERT"].includes(String(body.event ?? ""))) return null;
  const data = record(body.data);
  const key = record(data?.key);
  const message = record(data?.message);
  if (!data || !key || !message || key.fromMe === true) return null;

  const id = key.id;
  const rawRemoteJid = typeof key.remoteJid === "string" ? key.remoteJid : "";
  const altJid = typeof key.remoteJidAlt === "string" ? key.remoteJidAlt : (typeof key.senderPn === "string" ? key.senderPn : (typeof data.senderPn === "string" ? data.senderPn : ""));
  const remoteJid = /^\d{10,15}@s\.whatsapp\.net$/.test(rawRemoteJid)
    ? rawRemoteJid
    : /^\d{10,15}@s\.whatsapp\.net$/.test(altJid)
    ? altJid
    : rawRemoteJid;

  const instance = body.instance ?? body.instanceName;
  if (typeof id !== "string" || !id || typeof remoteJid !== "string" || typeof instance !== "string") return null;
  // Reject group messages, status broadcasts, newsletters or unresolved JIDs.
  if (!/^\d{10,15}@s\.whatsapp\.net$/.test(remoteJid)) return null;
  const number = remoteJid.split("@")[0];
  const extended = record(message.extendedTextMessage);
  const ephemeral = record(message.ephemeralMessage);
  const innerEphemeral = record(ephemeral?.message);
  const innerExtended = record(innerEphemeral?.extendedTextMessage);
  const text = message.conversation ?? extended?.text ?? innerEphemeral?.conversation ?? innerExtended?.text;
  if (typeof text !== "string" || !text.trim() || text.length > 1600) return null;
  const pushName = typeof data.pushName === "string" ? data.pushName.trim() : undefined;
  return { id, remoteJid, number, text: text.trim(), instance, pushName };
}
