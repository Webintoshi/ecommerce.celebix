import {lookup as dnsLookup} from 'node:dns/promises';
import {request as httpsRequest} from 'node:https';
import {isIP} from 'node:net';

function publicIpv4(value:string):boolean {
 if(isIP(value)!==4)return false;
 const [a,b,c]=value.split('.').map(Number) as [number,number,number,number];
 return !(a===0||a===10||a===127||a>=224||(a===100&&b>=64&&b<=127)||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&(b===0||b===168||(b===88&&c===99)))||(a===198&&(b===18||b===19||(b===51&&c===100)))||(a===203&&b===0&&c===113));
}
function publicAddress(value:string):boolean {
 if(publicIpv4(value))return true;
 if(isIP(value)!==6)return false;
 // Deny mapped, translation, transition and documentation ranges; DNS AAAA
 // must be ordinary globally routed unicast, not a route into a private network.
 if(value.includes('.'))return false;
 const halves=value.toLowerCase().split('::'),left=halves[0]?.split(':').filter(Boolean)??[],right=halves[1]?.split(':').filter(Boolean)??[];
 const words=[...left,...Array.from({length:halves.length===2?8-left.length-right.length:0},()=> '0'),...right].map(part=>parseInt(part,16));
 if(words.length!==8)return false;
 const first=words[0]!;
 return (first&0xe000)===0x2000&&!(first===0x2001&&(words[1]!<=0x01ff||words[1]===0x0db8))&&first!==0x2002&&(first&0xfff0)!==0x3ff0;
}
export function isMerchantWwwPair(homepageHost:string,canonicalDomain:string):boolean {
 return homepageHost!==canonicalDomain&&!homepageHost.startsWith('www.www.')&&!canonicalDomain.startsWith('www.www.')
  &&(homepageHost===`www.${canonicalDomain}`||canonicalDomain===`www.${homepageHost}`);
}

/** One credential-free HEAD request; never follow the advertised Location. */
export function createMerchantHomepageRedirectProof(input:Readonly<{lookup?:(hostname:string)=>Promise<readonly {address:string;family:number}[]>;request?:typeof httpsRequest}>={}){
 return async(homepage:URL,canonicalDomain:string):Promise<boolean>=>{
  if(!/^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$/.test(canonicalDomain)||!canonicalDomain.includes('.')||homepage.protocol!=='https:'||homepage.username||homepage.password||homepage.port||homepage.pathname!=='/'||homepage.search||homepage.hash||!isMerchantWwwPair(homepage.hostname,canonicalDomain))return false;
  const from=new URL(`https://${homepage.hostname}/`),target=`https://${canonicalDomain}/`,deadline=Date.now()+5000;
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{
   const answers=await Promise.race([(input.lookup??(hostname=>dnsLookup(hostname,{all:true,verbatim:true})))(from.hostname),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('merchant_redirect_unavailable')),5000);})]);
   clearTimeout(timer);
   if(!Array.isArray(answers)||answers.length<1||answers.length>16||answers.some(row=>![4,6].includes(row.family)||isIP(row.address)!==row.family||!publicAddress(row.address)))return false;
   const pinned=answers.find(row=>row.family===4)??answers[0]!;
   if(Date.now()>=deadline)return false;
   return await new Promise<boolean>(resolve=>{
    let settled=false;const finish=(accepted:boolean)=>{if(!settled){settled=true;clearTimeout(timer);resolve(accepted);}};
    const request=(input.request??httpsRequest)(from,{method:'HEAD',rejectUnauthorized:true,servername:from.hostname,agent:false,family:pinned.family,maxHeaderSize:16384,lookup:(_hostname,_options,callback)=>callback(null,pinned.address,pinned.family),headers:{accept:'text/html','accept-encoding':'identity','user-agent':'Celebix-Merchant-Homepage/1'}},response=>{
     const location=response.headers.location;
     // Header equivalence is deliberately exact: no chain, URL coercion,
     // credentials, path, query or different canonical hostname.
     const accepted=(response.statusCode===301||response.statusCode===308)&&location===target;
     response.destroy();finish(accepted);
    });
    request.once('error',()=>finish(false));
    timer=setTimeout(()=>{finish(false);request.destroy();},Math.max(1,deadline-Date.now()));
    request.end();
   });
  }catch{return false;}finally{clearTimeout(timer);}
 };
}
