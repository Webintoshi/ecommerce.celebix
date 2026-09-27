/** Controlled acceptance driver. No database, native browser, or external provider is invoked. */
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const ownPath=fileURLToPath(import.meta.url);
const root=path.resolve(path.dirname(ownPath),'../../..');
const childEnvironment={NODE_ENV:'test',NODE_NO_WARNINGS:'1',TZ:'UTC'};
const profiles=Object.freeze(Object.fromEntries(['net','site'].map(family=>[family,Object.freeze({
 ownerOrigin:`https://owner.saas-staging.celebix.${family}`,
 panelOrigin:`https://panel.saas-staging.celebix.${family}`,
 platformDomainSuffix:`saas-staging.celebix.${family}`,
})])));

async function verifyScopes(){
 const [{createOnboardingStatusCredentialCodec},{createOnboardingStatusHandler},{createOnboardingPendingResult,canonicalOwnerPanelSessionHandoffResult}]=await Promise.all([
  import('../../../apps/owner/lib/self-serve-status/credential-codec.ts'),
  import('../../../apps/owner/lib/self-serve-status/handler.ts'),
  import('../../../apps/owner/lib/panel-session-handoff/internal-response.ts'),
 ]);
 const now=new Date('2026-09-28T00:00:00.000Z');
 for(const [family,scope]of Object.entries(profiles)){
  const codec=createOnboardingStatusCredentialCodec({key:randomBytes(32),randomBytes});
  const proof=codec.issue();let stage='checking_access',readKind='status',reads=0;
  // This narrow controlled port is not a substitute for real SQL scope/TTL assertions.
  const handler=createOnboardingStatusHandler({scope,codec,clock:()=>now,repository:{async readStatus(input){
   reads++;assert.equal(input.digest,proof.digest);assert.deepEqual(input.scope,scope);
   return readKind==='status'?{kind:'status',projection:{stage,updatedAt:now.toISOString(),...(stage==='ready'?{storeSlug:'qa-acceptance'}:{})}}:{kind:readKind};
  }}});
  const request=(suffix='',cookie=true,origin=scope.ownerOrigin)=>new Request(`${origin}/api/self-serve/status${suffix}`,{headers:cookie?{cookie:`__Host-celebix_onboarding_status=${proof.credential}`}:{}});
  let response=await handler(request());assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(response.headers.get('referrer-policy'),'no-referrer');assert.equal(response.headers.has('set-cookie'),false);
  let dto=await response.json();assert.equal(dto.stage,'checking_access');assert.equal(dto.pollAfterMs,5000);assert.equal(dto.loginUrl,undefined);assert.equal(dto.storefrontUrl,undefined);
  const before=reads;assert.equal((await handler(request('',false))).status,401);assert.equal((await handler(request('?attemptId=hint'))).status,401);assert.equal((await handler(request('',true,profiles[family==='net'?'site':'net'].ownerOrigin))).status,401);assert.equal(reads,before);
  stage='ready';response=await handler(request());dto=await response.json();assert.equal(dto.loginUrl,`${scope.panelOrigin}/auth/login?destination=qa-acceptance.admin.${scope.platformDomainSuffix}`);assert.equal(dto.storefrontUrl,`https://qa-acceptance.${scope.platformDomainSuffix}`);assert.equal(dto.pollAfterMs,0);
  readKind='expired';assert.equal((await handler(request())).status,401);readKind='unavailable';assert.equal((await handler(request())).status,503);
  const pending=createOnboardingPendingResult(scope.ownerOrigin);assert.equal(pending.status,202);assert.equal(canonicalOwnerPanelSessionHandoffResult(pending),JSON.stringify({schemaVersion:1,kind:'onboarding_pending',statusUrl:`${scope.ownerOrigin}/onboarding/status`}));
 }
 return {kind:'controlled_scope_checks',pass:true,profiles:['net','site'],checksPerProfile:['pending_no_links','cookie_no_renewal','other_browser_denied','hint_denied','foreign_origin_denied','ready_exact_urls','expired_401','unavailable_503','canonical_pending_202']};
}

const groups=[
 {id:'status_proof_cookie',files:[
  'apps/owner/lib/self-serve-status/credential-codec.test.ts',
  'apps/owner/lib/self-serve-status/status.test.ts',
  'apps/owner/lib/self-serve-browser-bound-registration/handler.test.ts',
 ]},
 {id:'pending_signed_protocol',files:[
  'tests/saas-phase2/onboarding-status/in-process.test.mjs',
  'apps/owner/lib/panel-session-handoff/initial-callback-executor.test.ts',
  'apps/owner/lib/panel-session-handoff/internal-callback-handler.test.ts',
  'apps/owner/lib/panel-session-handoff/internal-response.test.ts',
  'apps/customer-panel/lib/panel-session-completion/completion.test.ts',
  'apps/customer-panel/lib/panel-session-completion/transport.test.ts',
 ]},
 {id:'status_component_dom',files:['apps/owner/components/self-serve/OnboardingStatus.behavior.test.mjs']},
 {id:'fresh_returning_login',files:[
  'apps/owner/lib/panel-returning-login/service.test.ts',
  'apps/owner/lib/panel-returning-login/postgres-session-issuer.test.ts',
  'apps/customer-panel/lib/panel-returning-login/handler.test.ts',
 ]},
 {id:'runtime_failures_recovery',files:[
  'tests/saas-phase2/staging-auth-runtime/runtime-resolver.test.mjs',
  'tests/saas-phase2/staging-auth-runtime/logto-provider.test.mjs',
  'apps/owner/lib/self-serve-registration-completion.test.ts',
  'apps/owner/lib/onboarding-jobs/worker.test.ts',
 ]},
 {id:'setup_readonly_permissions',files:[
  'apps/customer-panel/lib/server-setup/edge-client.test.ts',
  'apps/customer-panel/lib/server-setup/default.test.ts',
  'apps/customer-panel/lib/server-setup/loader.test.ts',
  'apps/customer-panel/lib/setup-ui/model.test.ts',
  'apps/customer-panel/lib/setup-ui/presentation.test.ts',
 ]},
 {id:'delivery_model',files:[
  'apps/customer-panel/lib/checkout-delivery-ui/model.test.ts',
  'apps/customer-panel/lib/checkout-delivery-ui/presentation.test.ts',
 ]},
];
function child(args,timeout=90000){return spawnSync(process.execPath,args,{cwd:root,env:childEnvironment,encoding:'utf8',maxBuffer:16*1024*1024,timeout});}
function summarize(result){
 const output=typeof result.stdout==='string'?result.stdout:'';
 const count=name=>Number([...output.matchAll(new RegExp(`^# ${name} (\\d+)$`,'gm'))].at(-1)?.[1]??0);
 return {pass:result.status===0&&!result.error,tests:count('tests'),passed:count('pass'),failed:count('fail'),skipped:count('skipped'),...(result.error?{code:result.error.code==='ETIMEDOUT'?'controlled_group_timeout':'controlled_group_unavailable'}:{})};
}

if(process.argv[2]==='--scope-checks'){
 try{console.log(JSON.stringify(await verifyScopes()));}catch{console.log(JSON.stringify({kind:'controlled_scope_checks',pass:false,code:'scope_acceptance_failed'}));process.exitCode=1;}
}else{
 if(process.argv.length!==2)throw new Error('acceptance_fixture_arguments_forbidden');
 const startSource=spawnSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8',env:childEnvironment});
 const scopeResult=child(['--conditions=react-server','--experimental-transform-types',ownPath,'--scope-checks']);
 let scopes;try{scopes=JSON.parse(scopeResult.stdout);if(!scopes||typeof scopes!=='object'||Array.isArray(scopes))throw new Error('scope_result_invalid');}catch{scopes={kind:'controlled_scope_checks',pass:false,code:'scope_runner_unavailable'};}
 scopes.pass=scopes.pass===true&&scopeResult.status===0&&!scopeResult.error;
 const results=[];
 for(const group of groups){
  if(group.files.some(file=>!existsSync(path.join(root,file)))){results.push({id:group.id,pass:false,code:'controlled_test_source_missing'});continue;}
  const result=summarize(child(['--conditions=react-server','--experimental-transform-types','--test','--test-concurrency=1','--test-reporter=tap',...group.files]));
  results.push({id:group.id,...result});
 }
 const source=spawnSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8',env:childEnvironment});
 const dirty=spawnSync('git',['status','--porcelain'],{cwd:root,encoding:'utf8',env:childEnvironment});
 const pass=scopes.pass&&results.every(group=>group.pass&&group.tests>0&&group.failed===0&&group.skipped===0);
 console.log(JSON.stringify({schemaVersion:1,mode:'controlled',checkedAt:new Date().toISOString(),sourceSha:/^[a-f0-9]{40}\n?$/.test(source.stdout)?source.stdout.trim():null,sourceShaAtStart:/^[a-f0-9]{40}\n?$/.test(startSource.stdout)?startSource.stdout.trim():null,sourceStable:startSource.status===0&&source.status===0&&startSource.stdout===source.stdout,worktreeDirty:dirty.status===0?dirty.stdout.length>0:null,pass,scopes,groups:results,totalReportedTests:results.reduce((sum,group)=>sum+(group.tests??0),0),boundaries:{database:false,nativeBrowser:false,liveNetwork:false,externalIdentityProvider:false,paymentExecution:false,productionMutation:false},pendingLive:['net_browser','site_browser','wildcard_dns_tls','actual_email_verification','alpler_existing_login','live_storefront_setup','restart_and_latency']},null,2));
 if(!pass)process.exitCode=1;
}
