import {resolvePlatformIdentity} from '@/lib/platform/auth';
import {platformTransaction} from '@/lib/platform/database';
import {ownerPublicOrigin} from '@/lib/platform/origin';
import {createInvitationRecoveryHandler,createInvitationRecoveryRepository} from '@/lib/platform-invitation-recovery/recovery';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export async function POST(request:Request):Promise<Response>{
 return createInvitationRecoveryHandler({origin:ownerPublicOrigin,resolveOperator:resolvePlatformIdentity,now:()=>new Date(),recover:async(operator,input,now)=>{
  const repository=createInvitationRecoveryRepository({issuer:process.env.CELEBIX_LOGTO_ISSUER?.trim()??'',transaction:(_write,run)=>platformTransaction(false,client=>run(client))});
  return repository.recover(operator,input,now);
 }})(request);
}
