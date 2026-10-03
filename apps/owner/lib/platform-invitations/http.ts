import type {createInvitationService} from './service.ts';
import type {createInvitationTransport} from '../../../../packages/saas-data/src/platform-invitations/transport.ts';
export function createInvitationInternalHandler(resolve:()=>Promise<{transport:ReturnType<typeof createInvitationTransport>;service:ReturnType<typeof createInvitationService>;ownerOrigin:string}>){
 return async(request:Request):Promise<Response>=>{
  const headers={'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'};
  try{const runtime=await resolve();if(new URL(request.url).origin!==runtime.ownerOrigin)throw Error('invitation_denied');const payload=await runtime.transport.verify(request);
   if(payload.action==='start'&&Object.keys(payload).sort().join(',')==='action,adminHost,token'&&typeof payload.token==='string'&&typeof payload.adminHost==='string')return Response.json(await runtime.service.start(payload.token,payload.adminHost),{headers});
   if(payload.action==='complete'&&Object.keys(payload).sort().join(',')==='action,binding,code,state'&&typeof payload.state==='string'&&typeof payload.code==='string'&&typeof payload.binding==='string')return Response.json(await runtime.service.complete(payload.state,payload.code,payload.binding),{headers});
   throw Error('invitation_denied');
  }catch(error){const code=error instanceof Error?error.message:'';const status=['invitation_denied','invitation_transport_denied','verified_identity_required','admin_host_unverified','invitation_callback_consumed','operator_denied'].includes(code)?403:503;return Response.json({error:status===403?'invitation_denied':'invitation_unavailable'},{status,headers});}
 };
}
