import {createHmac} from 'node:crypto';
import {createServer} from 'node:http';
import {isIP} from 'node:net';
import {pathToFileURL} from 'node:url';

const hosts=new Set(['panel.saas-staging.celebix.net','panel.saas-staging.celebix.site']);
const denied=()=>({statusCode:403,headers:{}});
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const normalizePeer=value=>typeof value==='string'&&value.startsWith('::ffff:')?value.slice(7):value;

// The socket peer is the authority. Traefik must use trustForwardHeader=false,
// forwardBody=false and its default entrypoint forwarding-header scrub.
export function createIngressSigner({keyHex,traefikIpv4,clock=()=>new Date()}){
 if(typeof keyHex!=='string'||!/^[a-f0-9]{64}$/.test(keyHex)||isIP(traefikIpv4??'')!==4||traefikIpv4==='0.0.0.0'||typeof clock!=='function')throw Error('ingress_configuration_invalid');
 const key=Buffer.from(keyHex,'hex');
 return function authorizeAndSign(input){
  try{
   if(input?.method!=='GET'||input.url!=='/authenticate'||normalizePeer(input.remoteAddress)!==traefikIpv4||!Array.isArray(input.rawHeaders)||input.rawHeaders.length%2||input.rawHeaders.length>48)return denied();
   const headers=new Map();
   for(let i=0;i<input.rawHeaders.length;i+=2){
    const name=input.rawHeaders[i],value=input.rawHeaders[i+1];
    if(typeof name!=='string'||typeof value!=='string'||value.length>512)return denied();
    const lower=name.toLowerCase();if(headers.has(lower))return denied();headers.set(lower,value);
   }
   const host=headers.get('x-forwarded-host'),origin='https://'+host,operation=headers.get('idempotency-key');
   if(headers.get('x-forwarded-method')!=='POST'||headers.get('x-forwarded-uri')!=='/api/admin-login/send'||headers.get('x-forwarded-proto')!=='https'||!hosts.has(host)||headers.get('origin')!==origin||!uuid.test(operation??'')||headers.has('cookie')||headers.has('authorization')||headers.has('transfer-encoding')||(headers.has('content-length')&&headers.get('content-length')!=='0'))return denied();
   // ForwardAuth regenerates XFF from req.RemoteAddr AFTER Connection stripping
   // when trustForwardHeader=false. Never forward incoming XFF in its whitelist.
   const sourceIp=headers.has('x-forwarded-for')?headers.get('x-forwarded-for'):headers.get('x-real-ip');
   if(sourceIp!==undefined&&(sourceIp.length>45||sourceIp.includes('%')||!isIP(sourceIp)))return denied();
   const ip=sourceIp??'unknown';
   const date=clock();if(!(date instanceof Date)||!Number.isFinite(date.getTime()))return denied();
   const time=date.toISOString();
   const signature=createHmac('sha256',key).update(['celebix/admin-login/ingress/v1',origin,'/api/admin-login/send',operation,ip,time].join('\n')).digest('hex');
   return{statusCode:204,headers:{'x-celebix-admin-ip':ip,'x-celebix-admin-ip-time':time,'x-celebix-admin-ip-signature':signature}};
  }catch{return denied();}
 };
}

// No upstream fetch, request-body read, cookie access, public router or logging.
export function createIngressSignerServer(options){
 const authorize=createIngressSigner(options);
 const server=createServer({maxHeaderSize:4096,headersTimeout:3000,requestTimeout:5000,keepAliveTimeout:1000},(request,response)=>{
  const result=authorize({method:request.method,url:request.url,remoteAddress:request.socket.remoteAddress,rawHeaders:request.rawHeaders});
  response.sendDate=false;response.writeHead(result.statusCode,result.headers);response.end();
 });
 server.maxHeadersCount=24;server.maxRequestsPerSocket=16;server.setTimeout(5000,socket=>socket.destroy());
 server.on('clientError',(_error,socket)=>socket.destroy());
 return server;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  const server=createIngressSignerServer({keyHex:process.env.ADMIN_INGRESS_KEY_HEX,traefikIpv4:process.env.ADMIN_INGRESS_TRAEFIK_IPV4});
  server.on('error',()=>{process.exitCode=1;server.close();});
  server.listen(8080,'0.0.0.0');
  for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>{server.close();server.closeAllConnections();});
 }catch{process.exitCode=1;}
}
