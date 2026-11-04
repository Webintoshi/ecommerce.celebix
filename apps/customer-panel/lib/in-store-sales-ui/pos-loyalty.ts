import {parseLoyaltyAdminPayload,parseLoyaltyAdminResult,type LoyaltyAdminPayloadMap,type LoyaltyAdminResultMap} from '@celebix/saas-contracts';
export type PosLoyaltyAction='approve-pos'|'prepare-pos-reward';
export type PosLoyaltyAttempt={action:PosLoyaltyAction;operationId:string;payload:LoyaltyAdminPayloadMap[PosLoyaltyAction]};
export class PosLoyaltyError extends Error{constructor(message:string,readonly uncertain=false){super(message);this.name='PosLoyaltyError';}}
export async function posLoyaltyCommand<A extends PosLoyaltyAction>(attempt:PosLoyaltyAttempt&{action:A},recovering=false,transport:typeof fetch=fetch):Promise<LoyaltyAdminResultMap[A]>{
 const payload=parseLoyaltyAdminPayload(attempt.action,attempt.payload);
 async function call(recover:boolean){
  let response:Response;try{response=await transport(`/api/loyalty/${recover?'recover':attempt.action}`,{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'content-type':'application/json',accept:'application/json'},body:JSON.stringify({operationId:attempt.operationId,payload:recover?{action:attempt.action,payload}:payload})});}catch{throw new PosLoyaltyError('İşlemin sonucu henüz doğrulanamadı. Aynı işlemi kontrol edin.',true);}
  const body:unknown=await response.json().catch(()=>null);
  if(!response.ok){const message=body&&typeof body==='object'&&'message'in body&&typeof body.message==='string'?body.message:'Sadakat işlemi tamamlanamadı.';throw new PosLoyaltyError(message,response.status>=500);}
  if(recover&&body===null)return null;
  try{return parseLoyaltyAdminResult(attempt.action,body);}catch{throw new PosLoyaltyError('İşlem sonucu doğrulanamadı. Aynı işlemi kontrol edin.',true);}
 }
 if(recovering){const result=await call(true);if(result!==null)return result;}
 const result=await call(false);if(result===null)throw new PosLoyaltyError('İşlem sonucu doğrulanamadı.',true);return result;
}
