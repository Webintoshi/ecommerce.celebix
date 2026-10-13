import {resolveDefaultOwnerStagingAuthRouteSet} from '../../../../../lib/self-serve-auth-route-runtime/default.ts';
import {resolvePlatformIdentity} from '../../../../../lib/platform/auth.ts';
import {platformTransaction} from '../../../../../lib/platform/database.ts';
import {createMerchantPhoneEnrollmentHandler} from '../../../../../lib/merchant-whatsapp/enrollment.ts';
import {ownerPublicOrigin} from '../../../../../lib/platform/origin.ts';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function POST(request:Request){
 try{
  const routes=await resolveDefaultOwnerStagingAuthRouteSet(),service=routes.merchantPhoneService;if(!service)throw Error('merchant_enrollment_unavailable');
  const allowedOrigin=ownerPublicOrigin(request);
  if(!allowedOrigin)throw Error('merchant_enrollment_unavailable');
  return createMerchantPhoneEnrollmentHandler({allowedOrigin,phoneIdentity:service.codec.phoneIdentity,
   async requireOperator(){const identity=await resolvePlatformIdentity();if(identity.kind!=='authorized')throw Error('platform_access_denied');return {operatorId:identity.operator.operatorId,totpVerified:true};},
   enroll:input=>platformTransaction(true,async client=>{const selected=await client.query('SELECT outcome,authority FROM saas.merchant_phone_operator_enroll($1::jsonb)',[JSON.stringify(input)]);if(selected.rows.length!==1)throw Error('merchant_enrollment_unavailable');return selected.rows[0];}),
  })(request);
 }catch{return Response.json({code:'unavailable'},{status:503,headers:{'cache-control':'no-store','referrer-policy':'no-referrer'}});}
}
