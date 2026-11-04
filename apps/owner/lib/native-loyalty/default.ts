import {OWNER_STAGING_AUTH_ENVIRONMENT_FIELDS,parseOwnerStagingAuthConfig,resolveOwnerStagingAuthMode} from '../self-serve-auth-authority/config.ts';
import {initializeLoyaltyProductionRuntime} from './production.ts';
import {loyaltyWorkerDelay,type LoyaltyTick} from './worker.ts';
export async function startDefaultLoyaltyProductionWorker(source:Record<string,string|undefined>=process.env):Promise<Readonly<{stop():Promise<void>}>>{
 if(source.NODE_ENV!=='production'||source.NEXT_PHASE==='phase-production-build'||source.NEXT_PRIVATE_BUILD_WORKER==='1'||source.NEXT_IS_EXPORT_WORKER==='1'||process.argv.includes('build')||resolveOwnerStagingAuthMode(source)!=='approved_staging')return Object.freeze({async stop(){}});
 const config=parseOwnerStagingAuthConfig(Object.fromEntries(OWNER_STAGING_AUTH_ENVIRONMENT_FIELDS.map(name=>[name,source[name]])));
 const runtime=await initializeLoyaltyProductionRuntime(config.database);let stopped=false,timer:ReturnType<typeof setTimeout>|undefined,active:Promise<void>|undefined,failures=0;
 const run=async()=>{
  let result:LoyaltyTick|null=null;try{result=await runtime.runOnce();failures=result?.failed?Math.min(6,failures+1):0;if(result?.failed)console.error('loyalty_worker_partial_failure');}catch{failures=Math.min(6,failures+1);console.error('loyalty_worker_run_failed');}
  if(!stopped)timer=setTimeout(()=>{active=run();},loyaltyWorkerDelay(result,failures));
 };
 console.info('loyalty_worker_started');active=run();return Object.freeze({async stop(){stopped=true;if(timer)clearTimeout(timer);await active;await runtime.close();}});
}
