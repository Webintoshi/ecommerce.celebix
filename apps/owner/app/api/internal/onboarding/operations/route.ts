import {getOwnerAuthContext,isSuperAdmin} from '../../../../../lib/owner-auth.ts';
import {configuredOperationsOrigin,resolveDefaultOnboardingOperations} from '../../../../../lib/onboarding-operations/default.ts';
import {createOnboardingOperationsHandler} from '../../../../../lib/onboarding-operations/http.ts';
export const runtime='nodejs';
export const dynamic='force-dynamic';
async function handle(request:Request){
 const origin=configuredOperationsOrigin();
 if(!origin)return Response.json({code:'unavailable'},{status:503,headers:{'cache-control':'no-store','referrer-policy':'no-referrer'}});
 return createOnboardingOperationsHandler({origin,authorize:async()=>isSuperAdmin(await getOwnerAuthContext()),resolve:resolveDefaultOnboardingOperations,now:()=>new Date()})(request);
}
export const GET=handle;
export const POST=handle;
