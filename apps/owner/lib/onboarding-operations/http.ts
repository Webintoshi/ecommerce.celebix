import type {OnboardingOperationsService} from './service.ts';
const PATH='/api/internal/onboarding/operations';
const HEADERS={'cache-control':'no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff'};
const response=(body:unknown,status:number)=>Response.json(body,{status,headers:HEADERS});
async function readBoundedBody(request:Request):Promise<string|null>{
 if(!request.body)return '';
 const reader=request.body.getReader();const chunks:Uint8Array[]=[];let bytes=0;const deadline=Date.now()+5000;
 try{
  for(;;){
   let timer:ReturnType<typeof setTimeout>|undefined;
   let chunk:ReadableStreamReadResult<Uint8Array>;
   try{chunk=await Promise.race([reader.read(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('body_timeout')),Math.max(1,deadline-Date.now()));})]);}finally{clearTimeout(timer);}
   if(chunk.done)break;bytes+=chunk.value.byteLength;
   if(bytes>1024){void reader.cancel().catch(()=>undefined);return null;}chunks.push(chunk.value);
  }
  return new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks));
 }catch{void reader.cancel().catch(()=>undefined);throw new Error('body_unavailable');}
 finally{reader.releaseLock();}
}
export function createOnboardingOperationsHandler(input:{origin:string;authorize:()=>Promise<boolean>;resolve:()=>Promise<OnboardingOperationsService|null>;now:()=>Date}){
 return async(request:Request):Promise<Response>=>{
  try{
   const url=new URL(request.url);
   if(url.origin!==input.origin||url.pathname!==PATH||url.search||url.hash||!['GET','POST'].includes(request.method))return response({code:'not_found'},404);
   if(!await input.authorize())return response({code:'forbidden'},403);
   let command:{jobId:string;expectedVersion:number}|undefined;
   if(request.method==='POST'){
    if(request.headers.get('origin')!==input.origin||request.headers.get('x-celebix-csrf')!=='onboarding-operations-v1'||request.headers.get('sec-fetch-site')&&request.headers.get('sec-fetch-site')!=='same-origin')return response({code:'forbidden'},403);
    if(request.headers.get('content-type')?.split(';')[0].trim()!=='application/json')return response({code:'invalid'},400);
    if(Number(request.headers.get('content-length'))>1024)return response({code:'body_too_large'},413);
    const text=await readBoundedBody(request);if(text===null)return response({code:'body_too_large'},413);
    let body:unknown;try{body=JSON.parse(text);}catch{return response({code:'invalid'},400);}
    if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).sort().join(',')!=='expectedVersion,jobId')return response({code:'invalid'},400);
    const b=body as Record<string,unknown>;
    if(typeof b.jobId!=='string'||!Number.isSafeInteger(b.expectedVersion))return response({code:'invalid'},400);
    command={jobId:b.jobId,expectedVersion:b.expectedVersion as number};
   }
   const service=await input.resolve();if(!service)return response({code:'unavailable'},503);
   if(command){const result=await service.retry({superAdmin:true},command,input.now());return response(result,result.kind==='queued'?202:result.kind==='busy'||result.kind==='conflict'?409:result.kind==='invalid'?400:result.kind==='forbidden'?403:503);}
   const result=await service.list({superAdmin:true},input.now());return result.kind==='ok'?response(result.data,200):response({code:result.kind},result.kind==='forbidden'?403:503);
  }catch{return response({code:'unavailable'},503);}
 };
}
