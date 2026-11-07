import type {AttendanceQuota,AttendanceInput} from "./attendance-quota";
type RedisFixture={get(k:string):Promise<string|null>;exists(k:string):Promise<number>;set(k:string,v:string,...args:unknown[]):Promise<unknown>};
const states=new WeakMap<object,Map<string,{input:AttendanceInput;newWindow:boolean;period:string}>>();
export function memoryAttendanceQuota(redis:RedisFixture):AttendanceQuota{
 let pending=states.get(redis);if(!pending){pending=new Map();states.set(redis,pending);}const reservations=pending;
 const period=(i:AttendanceInput)=>i.isTrial?"trial":new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit"}).format(i.now).slice(0,7);
 const key=(i:AttendanceInput)=>i.isTrial?"crm:quota:trial:"+i.tenantId:"crm:quota:"+i.tenantId+":"+period(i);
 return {
  reserve:async input=>{
   const current=Math.max(input.floor,Number(await redis.get(key(input))||0));
   const fresh=!await redis.exists("crm:session:"+input.tenantId+":"+input.phone);
   const held=[...reservations.values()].filter(r=>r.input.tenantId===input.tenantId&&r.newWindow&&r.period===period(input)).length;
   if(fresh&&current+held>=input.limit)return{allowed:false,reason:"quota_exceeded"};
   const token=crypto.randomUUID();reservations.set(token,{input,newWindow:fresh,period:period(input)});
   return{allowed:true,token,period:period(input),used:current,newWindow:fresh};
  },
  dispatch:async(_input,token)=>{if(!reservations.has(token))throw Error("missing_reservation");},
  commit:async(input,token)=>{
   const r=reservations.get(token);if(!r)throw Error("missing_reservation");
   const used=Math.max(input.floor,Number(await redis.get(key(input))||0))+(r.newWindow?1:0);
   await redis.set(key(input),String(used));reservations.delete(token);
   return{committed:true,used,period:r.period,newWindow:r.newWindow};
  },
  release:async(_input,token)=>{reservations.delete(token);}
 };
}

