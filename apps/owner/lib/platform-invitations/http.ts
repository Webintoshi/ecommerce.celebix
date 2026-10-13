import type {invitationRuntime} from './runtime.ts';
// Retired permanently: old signed callers cannot start or complete access grants.
export function createInvitationInternalHandler(_resolve:typeof invitationRuntime) {
 return async(_request:Request):Promise<Response>=>Response.json({code:'invitations_retired',message:'Davet bağlantıları artık kullanılmıyor.'},{status:410,headers:{'cache-control':'no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff'}});
}
