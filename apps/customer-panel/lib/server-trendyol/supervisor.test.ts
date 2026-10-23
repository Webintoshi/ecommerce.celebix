import assert from 'node:assert/strict';
import test from 'node:test';
const implementation=await import('./supervisor.ts').catch(()=>({})) as typeof import('./supervisor.ts');

const SOURCE:Record<string,string|undefined>={
  CELEBIX_TRENDYOL_WORKER_ENABLED:'true',NEXT_RUNTIME:'nodejs',
  CELEBIX_SAAS_AUTH_MODE:'approved_staging',CELEBIX_DEPLOYMENT_TIER:'staging',CELEBIX_STAGING_ACTIVATION_ID:'staging_auth01_qa',
  CELEBIX_OWNER_ORIGIN:'https://owner.saas-staging.celebix.net',CELEBIX_PANEL_ORIGIN:'https://panel.saas-staging.celebix.net',CELEBIX_PLATFORM_DOMAIN_SUFFIX:'saas-staging.celebix.net',
  CELEBIX_SAAS_DATABASE_NAME:'celebix_saas_staging_auth01',CELEBIX_SAAS_DATABASE_URL:'postgresql://worker:SECRET@db.test/celebix_saas_staging_auth01?sslmode=require',
  CELEBIX_LOGTO_CLIENT_ID:'fixture',CELEBIX_LOGTO_END_SESSION_ENDPOINT:'https://identity.example.test/oidc/session/end',
  CELEBIX_MERCHANT_PROVIDER_CREDENTIAL_ACTIVE_KEY_ID:'provider.current',CELEBIX_MERCHANT_PROVIDER_CREDENTIAL_KEYS:'provider.current:'+Buffer.alloc(32,2).toString('base64url'),
};
for(const p of ['BROWSER_INTERNAL','CALLBACK_INTERNAL','HANDOFF','SESSION']){SOURCE[`CELEBIX_${p}_KEY_ID`]='fixture';SOURCE[`CELEBIX_${p}_KEY_B64URL`]=Buffer.alloc(32,1).toString('base64url');}
const READY={name:'celebix_saas_staging_auth01',authorized:true,ready:true,executable:true};
const EMPTY={claimed:0,completed:0,deferred:0,stale:0};
type Timer={callback:()=>void;delay:number;cancelled:boolean;unrefs:number;unref():void};
function fixture(options:Readonly<{source?:Record<string,string|undefined>;readiness?:Record<string,unknown>;run?:()=>Promise<typeof EMPTY>;query?:()=>Promise<{rows:Record<string,unknown>[]}>}>={}){
  assert.equal(typeof implementation.createTrendyolWorkerSupervisor,'function','Trendyol supervisor must exist');
  const timers:Timer[]=[],messages:string[]=[],signals=new Map<string,()=>void>(),queries:string[]=[],poolOptions:unknown[]=[],runs:any[]=[];
  let ends=0;
  const pool={connect:async()=>{throw Error('unused fixture checkout');},query:async(sql:string)=>{queries.push(sql);return options.query?options.query():{rows:[options.readiness??READY]};},on:()=>pool,end:async()=>{ends++;}};
  const handle=implementation.createTrendyolWorkerSupervisor({
    source:options.source??SOURCE,createPool:config=>{poolOptions.push(config);return pool;},
    runOnce:async input=>{runs.push(input);return options.run?options.run():EMPTY;},
    scheduler:{schedule(callback,delay){const timer:Timer={callback,delay,cancelled:false,unrefs:0,unref(){this.unrefs++;}};timers.push(timer);return timer;},cancel(timer){(timer as Timer).cancelled=true;}},
    signals:{once(signal,listener){signals.set(signal,listener);},removeListener(signal,listener){if(signals.get(signal)===listener)signals.delete(signal);}},
    logger:{info(message){messages.push(message);},error(message){messages.push(message);}},
  });
  const next=()=>timers.find(timer=>!timer.cancelled);
  const fire=async()=>{const timer=next();assert.ok(timer,'worker must have a scheduled tick');timer.cancelled=true;timer.callback();await new Promise<void>(resolve=>setImmediate(resolve));};
  return {handle,timers,messages,signals,queries,poolOptions,runs,pool,next,fire,get ends(){return ends;}};
}

test('disabled flags, edge runtime and build phase create no pool, keys, signal listeners or timer',()=>{
  for(const source of [{CELEBIX_TRENDYOL_WORKER_ENABLED:'false'},{CELEBIX_TRENDYOL_WORKER_ENABLED:'1'}, {...SOURCE,NEXT_RUNTIME:'edge'}, {...SOURCE,NEXT_PHASE:'phase-production-build'}]){
    const f=fixture({source});assert.equal(f.handle,null);assert.equal(f.poolOptions.length,0);assert.equal(f.signals.size,0);assert.equal(f.timers.length,0);assert.deepEqual(f.messages,[]);
  }
});

test('enabled worker reuses strict approved authority and native provider keyring without accepting a different database',()=>{
  assert.equal(typeof implementation.trendyolWorkerConfiguration,'function');
  const config=implementation.trendyolWorkerConfiguration({...SOURCE,PATH:'/fixture',CELEBIX_GOOGLE_OAUTH_CLIENT_SECRET:'unrelated'});
  assert.equal(config!.database.name,'celebix_saas_staging_auth01');assert.equal(config!.panelOrigin,'https://panel.saas-staging.celebix.net');assert.equal(config!.keyring.activeKeyId,'provider.current');
  for(const change of [{CELEBIX_SAAS_DATABASE_URL:'postgresql://worker:SECRET@db.test/other?sslmode=require'},{CELEBIX_MERCHANT_PROVIDER_CREDENTIAL_KEYS:'SECRET'},{CELEBIX_SESSION_KEY_B64URL:undefined}]){
    const f=fixture({source:{...SOURCE,...change}});assert.equal(f.handle,null);assert.equal(f.poolOptions.length,0);assert.deepEqual(f.messages,['trendyol_worker_configuration_unavailable']);assert.doesNotMatch(f.messages.join(),/SECRET/);
  }
});

test('worker checks database, workflow membership, function and execution privilege before processing jobs',async()=>{
  for(const readiness of [{...READY,name:'another_database'},{...READY,authorized:false},{...READY,ready:false},{...READY,executable:false}]){
    const f=fixture({readiness});assert.equal(f.queries.length,0);assert.equal(f.next()!.delay,5000);await f.fire();assert.equal(f.runs.length,0);assert.equal(f.next()!.delay,120000);assert.deepEqual(f.messages,['trendyol_worker_degraded']);await f.handle!.stop();
  }
});

test('ready worker uses a bounded pool, unreferenced timers, idle cadence and busy cadence without overlapping runs',async()=>{
  let count=0;
  const f=fixture({run:async()=>++count===1?{...EMPTY,claimed:2,completed:2}:EMPTY});
  assert.deepEqual(f.poolOptions[0],{connectionString:SOURCE.CELEBIX_SAAS_DATABASE_URL,max:2,connectionTimeoutMillis:3000,idleTimeoutMillis:10000,statement_timeout:10000,lock_timeout:3000,application_name:'celebix-trendyol-worker'});
  await f.fire();assert.equal(f.queries.length,1);assert.equal(f.runs.length,1);assert.equal(f.next()!.delay,3000);assert.equal(f.runs[0].panelOrigin,'https://panel.saas-staging.celebix.net');assert.equal(f.runs[0].pool,f.pool);
  await f.fire();assert.equal(f.queries.length,1);assert.equal(f.next()!.delay,60000);assert.ok(f.timers.every(timer=>timer.unrefs===1));assert.deepEqual(f.messages,['trendyol_worker_ready']);
  await f.handle!.stop();assert.equal(f.ends,1);assert.equal(f.signals.size,0);assert.equal(f.next(),undefined);await f.handle!.stop();assert.equal(f.ends,1);
});

test('failures back off to a bounded ceiling, redact errors and recheck readiness after recovery',async()=>{
  let attempt=0;
  const f=fixture({run:async()=>{if(++attempt<=3)throw Error('SECRET database details');return EMPTY;}});
  for(const delay of [120000,240000,300000]){await f.fire();assert.equal(f.next()!.delay,delay);}
  assert.equal(f.messages.filter(message=>message==='trendyol_worker_degraded').length,1);assert.doesNotMatch(f.messages.join(),/SECRET/);
  await f.fire();assert.equal(f.next()!.delay,60000);assert.equal(f.queries.length,4);await f.handle!.stop();
});

test('SIGTERM drains an in-flight iteration and closes the pool once without scheduling another tick',async()=>{
  let release!:()=>void;
  const f=fixture({run:()=>new Promise(resolve=>{release=()=>resolve(EMPTY);})});
  await f.fire();assert.equal(f.runs.length,1);f.signals.get('SIGTERM')!();assert.equal(f.ends,0);
  const stopped=f.handle!.stop();release();await stopped;assert.equal(f.ends,1);assert.equal(f.next(),undefined);assert.equal(f.signals.size,0);
});
