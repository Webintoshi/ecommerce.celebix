import {resolvePlatformIdentity} from './auth.ts';
import {ownerSameOrigin} from './origin.ts';
/** Retired control-plane mutations cannot bypass version, invitation, or audit safeguards. */
export async function retiredPlatformMutation(request:Request):Promise<Response>{
 if(!ownerSameOrigin(request))return Response.json({error:'İstek doğrulanamadı.'},{status:403});
 const auth=await resolvePlatformIdentity();if(auth.kind!=='authorized')return Response.json({error:'Doğrulanmış platform sahibi girişi gerekli.'},{status:auth.kind==='unavailable'?503:403});
 return Response.json({error:'Bu eski işlem kaldırıldı. Güncel sahip panelini kullanın.',next:'/stores',code:'legacy_operation_retired'},{status:410,headers:{'Cache-Control':'no-store'}});
}
