import 'server-only';
import {normalizeAdminRequestHostname} from '@celebix/saas-data';
import {readSupportCookie,supportCookie} from './policy.ts';
import {supportQuery} from './runtime.ts';
const headers={'Cache-Control':'no-store','Referrer-Policy':'no-referrer','Content-Type':'application/json'};
function fail(status:number){return Response.json({error:status===403?'support_denied':'support_unavailable'},{status,headers});}
async function boundedBody(request:Request):Promise<string>{
 if(request.headers.get('content-type')?.split(';')[0]?.trim()!=='application/json')throw Error('invalid_input');
 const reader=request.body?.getReader();if(!reader)throw Error('invalid_input');const chunks:Uint8Array[]=[];let size=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>512){await reader.cancel();throw Error('invalid_input');}chunks.push(value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return new TextDecoder('utf-8',{fatal:true}).decode(bytes);
}
export async function redeemSupport(request:Request):Promise<Response>{
 try{const host=normalizeAdminRequestHostname(request.headers.get('host'));if(request.headers.get('origin')!==`https://${host}`)return fail(403);
 const raw=await boundedBody(request);const payload=JSON.parse(raw);if(Object.keys(payload).length!==1||typeof payload.handoff!=='string'||!(/^[a-f0-9]{64}$/).test(payload.handoff))return fail(400);
 const result=await supportQuery('redeem',[payload.handoff,host]) as {credential:string;expiresAt:string};
 return Response.json({ok:true},{headers:{...headers,'Set-Cookie':supportCookie(result.credential,(Date.parse(result.expiresAt)-Date.now())/1000)}});
 }catch{return fail(403);}
}
export async function endSupport(request:Request):Promise<Response>{
 try{const host=normalizeAdminRequestHostname(request.headers.get('host'));if(request.headers.get('origin')!==`https://${host}`)return fail(403);const cookie=readSupportCookie(request.headers.get('cookie'));if(cookie.kind==='present')await supportQuery('end',[cookie.credential.slice(8),host]);return Response.json({ok:true},{headers:{...headers,'Set-Cookie':supportCookie('',0)}});}catch{return fail(503);}
}
