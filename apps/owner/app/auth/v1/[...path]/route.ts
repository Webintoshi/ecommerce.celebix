import {readBoundedBody,BodyTooLarge} from '@/lib/platform/body';
const allowed=/^(?:token|user|logout|verify|recover|otp|signup|factors(?:\/[a-f0-9-]{36}(?:\/(?:challenge|verify))?)?|\.well-known\/jwks\.json)$/;
export const dynamic='force-dynamic';
export const runtime='nodejs';
async function proxy(request:Request,{params}:{params:Promise<{path:string[]}>}){
 const path=(await params).path.join('/');
 if(!allowed.test(path)||!['GET','POST','PUT','DELETE'].includes(request.method))return Response.json({error:'Not found'},{status:404});
 const endpoint=process.env.CELEBIX_OWNER_AUTH_INTERNAL_URL;
 if(!endpoint)return Response.json({error:'Authentication unavailable'},{status:503});
 const original=new URL(request.url);const url=new URL(endpoint);url.pathname=`/${path}`;url.search=original.search;
 const headers=new Headers();for(const name of ['content-type','authorization','apikey','x-client-info','x-supabase-api-version']){const value=request.headers.get(name);if(value)headers.set(name,value);}
 try{const r=await fetch(url,{method:request.method,headers,body:['GET','HEAD'].includes(request.method)?undefined:await readBoundedBody(request,65536),redirect:'manual',signal:AbortSignal.timeout(8000)});const out=new Headers({'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'});const ct=r.headers.get('content-type');if(ct)out.set('content-type',ct);const location=r.headers.get('location');if(location){const target=new URL(location);if(!['owner.saas-staging.celebix.net','owner.saas-staging.celebix.site'].includes(target.hostname))return Response.json({error:'Redirect rejected'},{status:400});out.set('location',location);}return new Response(await r.arrayBuffer(),{status:r.status,headers:out});}catch(error){if(error instanceof BodyTooLarge)return Response.json({error:'Request too large'},{status:413});return Response.json({error:'Authentication unavailable'},{status:503});}
}
export const GET=proxy;export const POST=proxy;export const PUT=proxy;export const DELETE=proxy;
