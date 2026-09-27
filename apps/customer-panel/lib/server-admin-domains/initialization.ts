/** Coalesce initialization, cache success, and retry transient failures without a process restart. */
export function createRetryingInitialization<T>(initialize:()=>Promise<T|null>,clock=()=>Date.now()){
 let pending:Promise<T|null>|undefined;let retryAt=0,delay=1000;
 return ():Promise<T|null>=>{
  if(pending)return pending;if(clock()<retryAt)return Promise.resolve(null);
  pending=Promise.resolve().then(initialize).catch(()=>null).then(value=>{
   if(value===null){pending=undefined;retryAt=clock()+delay;delay=Math.min(30000,delay*2);}
   return value;
  });
  return pending;
 };
}
