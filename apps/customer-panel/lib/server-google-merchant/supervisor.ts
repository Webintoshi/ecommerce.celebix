import 'server-only';
import pg from 'pg';
import {createPostgresGoogleMerchantJobRepository,parseMerchantProviderCredentialKeyring} from '@celebix/saas-data';
import {merchantWorkerAuthConfiguration} from './config.ts';
import {googleMarketingConfiguration} from '../server-google-marketing/config.ts';
import {GoogleMarketingProvider} from '../../../../packages/saas-data/src/google-marketing/provider.ts';
import {GoogleMerchantProvider} from '../../../../packages/saas-data/src/google-merchant/provider.ts';
import {runGoogleMerchantWorkerOnce} from './worker.ts';
const state=globalThis as typeof globalThis&{celebixMerchantWorkerStarted?:boolean};
/** Runtime-only switch prevents build workers from acquiring product delivery leases. */
export function startGoogleMerchantWorker():void {
 if(state.celebixMerchantWorkerStarted||process.env.CELEBIX_GOOGLE_MERCHANT_WORKER_ENABLED!=='true')return;
 state.celebixMerchantWorkerStarted=true;
 let pool:pg.Pool;
 try{
  const config=merchantWorkerAuthConfiguration(process.env),keyring=parseMerchantProviderCredentialKeyring(process.env),configuration=googleMarketingConfiguration(process.env,keyring);
  if(!configuration.clientId||!configuration.clientSecret)throw Error('merchant_not_configured');
  pool=new pg.Pool({connectionString:config.database.url,max:2,connectionTimeoutMillis:3000,idleTimeoutMillis:10000,statement_timeout:10000,lock_timeout:3000,application_name:'celebix-merchant-worker'});pool.on('error',()=>undefined);
  const repository=createPostgresGoogleMerchantJobRepository({pool}),provider=new GoogleMerchantProvider(),oauth=new GoogleMarketingProvider(configuration);
  let stopped=false,timer:ReturnType<typeof setTimeout>|undefined,failures=0,checked=false;
  function schedule(delay:number){if(!stopped){timer=setTimeout(()=>void tick(),delay);timer.unref();}}
  async function tick(){let delay=60000;try{
   if(!checked){const result=await pool.query("SELECT current_database() AS name,pg_has_role(current_user,'celebix_saas_workflow','MEMBER') AS authorized,to_regprocedure('saas.google_merchant_claim(timestamptz,integer,uuid)') IS NOT NULL AS ready");if(result.rows[0]?.name!==config.database.name||result.rows[0]?.authorized!==true||result.rows[0]?.ready!==true)throw Error('merchant_runtime_unavailable');checked=true;console.info('google_merchant_worker_ready');}
   const result=await runGoogleMerchantWorkerOnce({repository,provider,keyring,refreshCredential:(credential,now)=>oauth.refresh(credential,now)});failures=0;if(result.claimed)delay=3000;
  }catch{if(failures++===0)console.error('google_merchant_worker_degraded');delay=Math.min(300000,60000*2**Math.min(failures,3));}finally{schedule(delay);}}
  const stop=()=>{stopped=true;if(timer)clearTimeout(timer);void pool.end();};process.once('SIGTERM',stop);process.once('SIGINT',stop);schedule(5000);
 }catch{console.error('google_merchant_worker_configuration_unavailable');}
}
