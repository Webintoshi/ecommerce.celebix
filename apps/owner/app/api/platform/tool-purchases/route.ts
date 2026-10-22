import {resolvePlatformIdentity} from '@/lib/platform/auth';
import {readPlatformToolPurchases,settlePlatformToolPurchase} from '@/lib/platform/database';
import {ownerPublicOrigin} from '@/lib/platform/origin';
import {handleToolPurchasesHttp} from '@/lib/platform/tool-purchases-http';
export const dynamic='force-dynamic';
export const runtime='nodejs';
async function handle(request:Request){
 return handleToolPurchasesHttp(request,{
  allowedOrigin:ownerPublicOrigin(request)??'https://invalid.invalid',resolveOperator:resolvePlatformIdentity,
  read:(operator,query)=>readPlatformToolPurchases(operator.operatorId,query),
  settle:(operator,input)=>{const{purchaseId,...receipt}=input.payload;return settlePlatformToolPurchase(operator.operatorId,purchaseId,receipt,input.expectedVersion,input.idempotencyKey);},
 });
}
export const GET=handle;
export const POST=handle;
