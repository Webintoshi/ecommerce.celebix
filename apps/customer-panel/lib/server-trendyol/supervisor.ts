import 'server-only';
import pg from 'pg';
import {merchantWorkerAuthConfiguration} from '../server-google-merchant/config.ts';
import {parseMerchantProviderCredentialKeyring} from '../../../../packages/saas-data/src/provider-execution/keyring-config.ts';
import type {MerchantProviderCredentialKeyring} from '../../../../packages/saas-data/src/provider-execution/credential-crypto.ts';
import type {PostgresPoolLike} from '../../../../packages/saas-data/src/postgres/pool.ts';
import {createPostgresTrendyolWorkflowRepository} from '../../../../packages/saas-data/src/trendyol/repository.ts';
import {TrendyolProvider} from '../../../../packages/saas-data/src/trendyol/provider.ts';

type Environment=Readonly<Record<string,string|undefined>>;
export type TrendyolWorkerConfiguration=Readonly<{database:Readonly<{name:string;url:string}>;panelOrigin:string;keyring:MerchantProviderCredentialKeyring}>;
export type TrendyolWorkerResult=Readonly<{claimed:number;completed:number;deferred:number;stale:number}>;
export interface TrendyolWorkerPool extends PostgresPoolLike {
  query(sql:string):Promise<Readonly<{rows:readonly Record<string,unknown>[]}>>;
  on(event:'error',listener:(error:Error)=>void):unknown;
  end():Promise<void>;
}
type Timer=Readonly<{unref():unknown}>;
type Scheduler=Readonly<{schedule(callback:()=>void,delay:number):Timer;cancel(timer:Timer):void}>;
type Signals=Readonly<{once(signal:'SIGTERM'|'SIGINT',listener:()=>void):unknown;removeListener(signal:'SIGTERM'|'SIGINT',listener:()=>void):unknown}>;
type Logger=Readonly<{info(message:string):void;error(message:string):void}>;
type Execution=Readonly<{pool:TrendyolWorkerPool;keyring:MerchantProviderCredentialKeyring;panelOrigin:string}>;
export type TrendyolWorkerHandle=Readonly<{stop():Promise<void>}>;
type Options=Readonly<{
  source:Environment;
  createPool(options:pg.PoolConfig):TrendyolWorkerPool;
  runOnce(input:Execution):Promise<TrendyolWorkerResult>;
  scheduler?:Scheduler;
  signals?:Signals;
  logger?:Logger;
}>;

/** Same approved database/authority and provider keyring used by the panel's native runtime. */
export function trendyolWorkerConfiguration(source:Environment):TrendyolWorkerConfiguration|null {
  if(source.CELEBIX_TRENDYOL_WORKER_ENABLED!=='true'||source.NEXT_PHASE==='phase-production-build'||source.NEXT_RUNTIME!==undefined&&source.NEXT_RUNTIME!=='nodejs')return null;
  try{
    const authority=merchantWorkerAuthConfiguration(source),keyring=parseMerchantProviderCredentialKeyring(source);
    return Object.freeze({database:authority.database,panelOrigin:authority.authority.panelOrigin,keyring});
  }catch{throw Error('trendyol_worker_configuration_unavailable');}
}

const READINESS=`SELECT current_database() AS name,
  pg_catalog.pg_has_role(current_user,'celebix_saas_workflow','MEMBER') AS authorized,
  p.signature IS NOT NULL AS ready,
  COALESCE(pg_catalog.has_function_privilege('celebix_saas_workflow',p.signature,'EXECUTE'),false) AS executable
FROM (SELECT pg_catalog.to_regprocedure('saas.trendyol_workflow(text,jsonb,timestamptz)') AS signature) p`;

/** Owns the scheduler and pool lifecycle; the native worker owns lease and tenant fencing. */
export function createTrendyolWorkerSupervisor(options:Options):TrendyolWorkerHandle|null {
  const logger=options.logger??console;
  let config:TrendyolWorkerConfiguration|null;
  try{config=trendyolWorkerConfiguration(options.source);}catch{logger.error('trendyol_worker_configuration_unavailable');return null;}
  if(config===null)return null;
  const configuration=config;
  const scheduler:Scheduler=options.scheduler??{
    schedule:(callback,delay)=>setTimeout(callback,delay),
    cancel:timer=>clearTimeout(timer as ReturnType<typeof setTimeout>),
  };
  const signals=options.signals??process;
  let pool:TrendyolWorkerPool;
  try{
    pool=options.createPool({connectionString:configuration.database.url,max:2,connectionTimeoutMillis:3000,idleTimeoutMillis:10000,statement_timeout:10000,lock_timeout:3000,application_name:'celebix-trendyol-worker'});
    pool.on('error',()=>undefined);
  }catch{for(const entry of configuration.keyring.keys)entry.key.fill(0);logger.error('trendyol_worker_configuration_unavailable');return null;}
  let stopped=false,checked=false,failures=0;
  let timer:Timer|undefined,inFlight:Promise<void>|undefined,stopping:Promise<void>|undefined;
  function schedule(delay:number):void {
    if(stopped)return;
    timer=scheduler.schedule(()=>{timer=undefined;inFlight=tick();},delay);timer.unref();
  }
  async function tick():Promise<void> {
    if(stopped)return;
    let delay=60000;
    try{
      if(!checked){
        const result=await pool.query(READINESS),row=result.rows[0];
        if(result.rows.length!==1||row?.name!==configuration.database.name||row?.authorized!==true||row?.ready!==true||row?.executable!==true)throw Error('trendyol_worker_runtime_unavailable');
        checked=true;logger.info('trendyol_worker_ready');
      }
      if(stopped)return;
      const result=await options.runOnce({pool,keyring:configuration.keyring,panelOrigin:configuration.panelOrigin});
      if(!Number.isSafeInteger(result.claimed)||result.claimed<0||result.claimed>2)throw Error('trendyol_worker_result_invalid');
      failures=0;if(result.claimed>0)delay=3000;
    }catch{
      checked=false;if(failures++===0)logger.error('trendyol_worker_degraded');
      delay=Math.min(300000,60000*2**Math.min(failures,3));
    }finally{schedule(delay);}
  }
  const onSignal=()=>{void stop();};
  function stop():Promise<void> {
    if(stopping)return stopping;
    stopped=true;if(timer!==undefined){scheduler.cancel(timer);timer=undefined;}
    signals.removeListener('SIGTERM',onSignal);signals.removeListener('SIGINT',onSignal);
    stopping=(async()=>{
      try{await inFlight;await pool.end();}catch{logger.error('trendyol_worker_shutdown_unavailable');}
      finally{for(const entry of configuration.keyring.keys)entry.key.fill(0);}
    })();
    return stopping;
  }
  signals.once('SIGTERM',onSignal);signals.once('SIGINT',onSignal);schedule(5000);
  return Object.freeze({stop});
}

const state=globalThis as typeof globalThis&{celebixTrendyolWorker?:TrendyolWorkerHandle};
/** Explicit runtime switch keeps build workers and the secondary panel from acquiring leases. */
export function startTrendyolWorker():void {
  if(state.celebixTrendyolWorker)return;
  const handle=createTrendyolWorkerSupervisor({source:process.env,createPool:configuration=>new pg.Pool(configuration),runOnce:async({pool,keyring,panelOrigin})=>{
    const {processTrendyolJobs}=await import('../../../../packages/saas-data/src/trendyol/worker.ts');
    return processTrendyolJobs({repository:createPostgresTrendyolWorkflowRepository({pool}),provider:new TrendyolProvider(),keyring,panelOrigin});
  }});
  if(handle)state.celebixTrendyolWorker=handle;
}
