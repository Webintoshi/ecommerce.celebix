import {fileURLToPath} from 'node:url';
import {realpathSync} from 'node:fs';
import {setTimeout as delay} from 'node:timers/promises';
export function workerEnabled(environment){
 const value=environment.CELEBIX_ONBOARDING_WORKER_ENABLED;
 if(value===undefined||value==='false')return false;
 if(value==='true')return true;
 throw new Error('onboarding_worker_flag_invalid');
}
export async function runWorkerLoop({signal,initialize,sleep=(ms)=>delay(ms,undefined,{signal}).catch(()=>undefined),log=(entry)=>console.info(JSON.stringify(entry))}){
 let runtime;let failures=0;
 try{
  while(!signal.aborted){
   try{
    if(!runtime)runtime=await initialize();
    const counts=await runtime.tick();failures=0;log({event:'onboarding_worker_tick',state:'healthy',counts});
   }catch{failures=Math.min(5,failures+1);log({event:'onboarding_worker_tick',state:'degraded'});}
   if(!signal.aborted)await sleep([15000,15000,30000,60000,120000,300000][failures]);
  }
 }finally{await runtime?.close();}
}
async function main(){
 const checking=process.argv.includes('--check-runtime');
 if(!checking&&!workerEnabled(process.env))return;
 const loaded=await import('../.onboarding-worker/runtime.cjs');
 const {initializeDefaultOnboardingWorker}=loaded.default??loaded;
 if(typeof initializeDefaultOnboardingWorker!=='function')throw new Error('onboarding_worker_runtime_invalid');
 if(checking)return;
 const controller=new AbortController();
 process.once('SIGTERM',()=>controller.abort());process.once('SIGINT',()=>controller.abort());
 await runWorkerLoop({signal:controller.signal,initialize:()=>initializeDefaultOnboardingWorker(process.env)});
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===realpathSync(process.argv[1]))main().catch(()=>{console.error('onboarding_worker_start_failed');process.exitCode=1;});
