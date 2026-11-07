import "server-only";
import { cookies } from "next/headers";

const COOKIE = "nw_crm_session";
type SupaUser = { id?: string; email?: string };
export function supabaseSettings() {
  const url = (process.env.CRM_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL)?.trim() ?? "";
  const key = (process.env.CRM_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY)?.trim() ?? "";
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(url) || !key || key.length < 20)
    throw new Error("crm_supabase_not_configured");
  return { url: url.replace(/\/$/, ""), key };
}
export function sessionCookieName() { return COOKIE; }
export async function verifyOperator() {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token || token.length > 4096) return null;
  const {url,key} = supabaseSettings();
  const res = await fetch(url+"/auth/v1/user", {
    headers: { apikey: key, Authorization: "Bearer "+token },
    cache: "no-store", signal: AbortSignal.timeout(6000)
  });
  if (!res.ok) return null;
  const user = await res.json() as SupaUser;
  if (!user.id || !/^[0-9a-f-]{36}$/.test(user.id)) return null;
  return { token, id: user.id, email: user.email ?? "" };
}
export async function supabaseRows<T>(path: string, token: string): Promise<T> {
  const {url,key} = supabaseSettings();
  const result = await fetch(url+"/rest/v1/"+path, {
    headers: { apikey: key, Authorization: "Bearer "+token, Accept: "application/json" },
    cache: "no-store", signal: AbortSignal.timeout(7000)
  });
  if (!result.ok) throw new Error("crm_data_unavailable");
  return await result.json() as T;
}
export function privateJson(value: unknown, status = 200) {
  return Response.json(value,{status,headers:{"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
}
export function isAllowedOrigin(origin: string | null, requestUrl: string): boolean {
  if (!origin) return true;
  try {
    const o = new URL(origin);
    const u = new URL(requestUrl);
    if (o.origin === u.origin) return true;
    const localHosts = ["localhost", "127.0.0.1", "host.docker.internal", "0.0.0.0"];
    if (o.protocol === u.protocol && o.port === u.port && localHosts.includes(o.hostname) && localHosts.includes(u.hostname)) return true;
    return o.origin === u.origin;
  } catch {
    return false;
  }
}
