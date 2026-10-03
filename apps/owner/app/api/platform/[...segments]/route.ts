import {ownerPublicOrigin} from '@/lib/platform/origin';
import {handlePlatformHttp} from '@/lib/platform/http';
import {resolvePlatformIdentity} from '@/lib/platform/auth';
import {readPlatform,commandPlatform} from '@/lib/platform/database';
export const dynamic='force-dynamic';
export const runtime='nodejs';
async function handle(request:Request,{params}:{params:Promise<{segments:string[]}>}){
 return handlePlatformHttp(request,(await params).segments,{allowedOrigin:ownerPublicOrigin(request)??'https://invalid.invalid',resolveOperator:resolvePlatformIdentity,read:(operator,resource,query)=>readPlatform(operator.operatorId,resource,query),command:(operator,input)=>commandPlatform(operator.operatorId,input)});
}
export const GET=handle;export const POST=handle;
