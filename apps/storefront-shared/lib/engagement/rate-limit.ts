import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
// The durable per-cart quota remains authoritative. This bounded process guard
// also limits requests with invented credentials before they reach PostgreSQL.
export function createContactRequestLimiter(now:()=>number=Date.now){
 const windows=new Map<string,{started:number;count:number}>();
 return (hostname:string,headers:Headers):boolean=>{
  const time=now(),candidate=headers.get('cf-connecting-ip');
  const identity=candidate&&isIP(candidate)&&candidate===candidate.trim()?candidate:(headers.get('cookie')??'missing').slice(0,4096);
  const key=createHash('sha256').update(`contact-limit-v1\0${hostname}\0${identity}`).digest('hex');
  const previous=windows.get(key);if(previous&&time-previous.started<60_000){previous.count++;return previous.count<=60;}
  if(windows.size>=5000){for(const [id,entry]of windows)if(time-entry.started>=60_000)windows.delete(id);if(windows.size>=5000)windows.delete(windows.keys().next().value!);}
  windows.set(key,{started:time,count:1});return true;
 };
}
