import assert from 'node:assert/strict';
import test from 'node:test';
async function load(){try{return await import('./onboarding-worker.mjs');}catch{assert.fail('supervised worker entrypoint missing');}}
test('worker flag is strict and false by default',async()=>{
 const {workerEnabled}=await load();assert.equal(workerEnabled({}),false);assert.equal(workerEnabled({CELEBIX_ONBOARDING_WORKER_ENABLED:'false'}),false);assert.equal(workerEnabled({CELEBIX_ONBOARDING_WORKER_ENABLED:'true'}),true);
 for(const value of ['1','TRUE','yes',''])assert.throws(()=>workerEnabled({CELEBIX_ONBOARDING_WORKER_ENABLED:value}));
});
test('startup DB failure retries initialization without process restart and sanitized logging',async()=>{
 const {runWorkerLoop}=await load();let attempts=0,ticks=0;const logs=[];const controller=new AbortController();
 await runWorkerLoop({signal:controller.signal,initialize:async()=>{attempts++;if(attempts===1)throw new Error('private db details');return {tick:async()=>{ticks++;controller.abort();return {ready:1};},close:async()=>{}};},sleep:async()=>{},log:entry=>logs.push(entry)});
 assert.equal(attempts,2);assert.equal(ticks,1);assert.equal(JSON.stringify(logs).includes('private db details'),false);
});

test('runtime gate loads generated Node20 bundle even when feature disabled',async()=>{
 const {spawnSync}=await import('node:child_process');const path=(await import('node:path')).default;
 const script=new URL('./onboarding-worker.mjs',import.meta.url);
 const build=spawnSync(process.execPath,[new URL('./build-onboarding-worker.cjs',import.meta.url).pathname],{encoding:'utf8'});assert.equal(build.status,0,build.stderr);
 const result=spawnSync(process.execPath,[script.pathname,'--check-runtime'],{env:{...process.env,CELEBIX_ONBOARDING_WORKER_ENABLED:'false'},encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);
});

test('missing worker bundle fails runtime gate but ordinary disabled start stays disabled',async()=>{
 const {spawnSync}=await import('node:child_process');const {mkdtempSync,mkdirSync,copyFileSync,rmSync}=await import('node:fs');const {tmpdir}=await import('node:os');const path=(await import('node:path')).default;
 const directory=mkdtempSync(path.join(tmpdir(),'celebix-worker-gate-'));const scripts=path.join(directory,'scripts');mkdirSync(scripts);const script=path.join(scripts,'onboarding-worker.mjs');copyFileSync(new URL('./onboarding-worker.mjs',import.meta.url),script);
 try{const env={...process.env,CELEBIX_ONBOARDING_WORKER_ENABLED:'false'};assert.equal(spawnSync(process.execPath,[script],{env}).status,0);const checked=spawnSync(process.execPath,[script,'--check-runtime'],{env,encoding:'utf8'});assert.equal(checked.status,1);assert.match(checked.stderr,/onboarding_worker_start_failed/);}finally{rmSync(directory,{recursive:true,force:true});}
});
