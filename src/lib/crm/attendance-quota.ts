import "server-only";
import { createHash, randomUUID } from "node:crypto";

export type AttendanceInput = { tenantId: string; phone: string; instance: string; limit: number; floor: number; floorPeriod?: string; isTrial: boolean; now: Date };
export type AttendanceReservation = { allowed: boolean; reason?: string; token?: string; period?: string; used?: number; newWindow?: boolean };
export type AttendanceCommit = { committed: boolean; used: number; period: string; newWindow: boolean };
export interface AttendanceQuota {
 reserve(input: AttendanceInput): Promise<AttendanceReservation>;
 dispatch(input: AttendanceInput, token: string): Promise<void>;
 commit(input: AttendanceInput, token: string): Promise<AttendanceCommit>;
 release(input: AttendanceInput, token: string): Promise<void>;
}

async function rpc<T>(name: string, body: Record<string, unknown>): Promise<T> {
 const url = process.env.CRM_SUPABASE_URL?.trim().replace(/\/$/, "");
 const key = process.env.CRM_SUPABASE_SERVICE_ROLE_KEY?.trim();
 if (!url || !key) throw new Error("quota_service_not_configured");
 const response = await fetch(url+"/rest/v1/rpc/"+name, {
  method:"POST",headers:{apikey:key,Authorization:"Bearer "+key,"Content-Type":"application/json"},
  body:JSON.stringify(body),cache:"no-store",signal:AbortSignal.timeout(8000)
 });
 if (!response.ok) throw new Error("quota_operation_failed:"+response.status);
 return await response.json() as T;
}
export function attendanceQuota(): AttendanceQuota {
 return {
  reserve: async input => {
   const value = await rpc<AttendanceReservation>("crm_reserve_attendance", {
    p_tenant:input.tenantId,p_phone_hash:createHash("sha256").update(input.phone).digest("hex"),
    p_instance:input.instance,p_token:randomUUID(),p_limit:input.limit,p_floor:input.floor,p_floor_period:input.floorPeriod || null
   });
   if (typeof value.allowed!=="boolean" || (value.allowed && (!value.token || !value.period || !Number.isInteger(value.used)))) throw new Error("invalid_quota_reservation");
   return value;
  },
  dispatch: async (input,token) => {
   const r=await rpc<{dispatched:boolean}>("crm_dispatch_attendance",{p_tenant:input.tenantId,p_token:token,p_instance:input.instance,p_limit:input.limit});
   if(r.dispatched!==true)throw new Error("quota_dispatch_unconfirmed");
  },
  commit: async (input,token) => {
   const r=await rpc<AttendanceCommit>("crm_commit_attendance",{p_tenant:input.tenantId,p_token:token});
   if(!r.committed || !Number.isInteger(r.used) || !r.period)throw new Error("quota_commit_unconfirmed");
   return r;
  },
  release: async (input,token) => {
   const r=await rpc<{released:boolean}>("crm_release_attendance",{p_tenant:input.tenantId,p_token:token});
   if(r.released!==true)throw new Error("quota_release_unconfirmed");
  }
 };
}

