import type {PlatformOperatorContext} from '../../../../packages/saas-contracts/src/platform/types.ts';
export type InvitationRecoveryInput=Readonly<{storeId:string;invitationId:string;operationId:string;expectedVersion:number;includeTargetPrincipal:boolean}>;
export type InvitationRecoveryResult=Readonly<{code:'ok';invitationId:string;url:string}>;
type Client={query(sql:string,values?:unknown[]):Promise<{rows:Record<string,unknown>[]}>};
type Transaction=<T>(write:false,run:(client:Client)=>Promise<T>)=>Promise<T>;
export function createInvitationRecoveryRepository(_options:Readonly<{issuer:string;transaction:Transaction}>) {
 return Object.freeze({async recover(_operator:PlatformOperatorContext,_value:InvitationRecoveryInput,_now:Date):Promise<InvitationRecoveryResult>{throw new Error('invitations_retired');}});
}

type HandlerOptions=Readonly<{origin(request:Request):string|null;resolveOperator():Promise<{kind:string;operator?:PlatformOperatorContext}>;recover(operator:PlatformOperatorContext,input:InvitationRecoveryInput,now:Date):Promise<InvitationRecoveryResult>;now():Date}>;
function response(value:unknown,status:number){return Response.json(value,{status,headers:{'cache-control':'no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff'}});}
export function createInvitationRecoveryHandler(_options:HandlerOptions) {
 return async(_request:Request):Promise<Response>=>response({code:'invitations_retired',message:'Davet bağlantıları artık kullanılmıyor.'},410);
}
