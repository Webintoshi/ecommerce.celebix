import assert from 'node:assert/strict';
import test from 'node:test';
import {compile} from '../../lib/mira-final-test-support.ts';

const model={kind:'generic',displayName:'Celebix',logoUrl:null,accentColor:'#ff6500',canonicalAdminOrigin:null,loginHref:'/auth/login'};
const centralHost='panel.saas-staging.celebix.net';
const knownHosts=['market.admin.saas-staging.celebix.net','admin.market.example'];
let authenticated=false;
let host=centralHost;
const {default:LoginPage}=compile('app/login/page.tsx',{
 'next/navigation':{redirect:(location:string)=>{throw new Error(location);}},
 '../../lib/server-session':{resolveServerPanelSession:async()=>({kind:authenticated?'authenticated':'unauthenticated'})},
 'next/headers':{headers:async()=>new Headers({host})},
 '../../components/auth/TenantLogin':{TenantLogin:()=>null},
 '../../lib/server-admin-host-auth/default.ts':{resolveDefaultServerAdminHostAuthRuntime:async()=>null},
 '../../lib/tenant-admin-login-model.ts':{resolveTenantAdminLoginModel:async({hostHeader}:{hostHeader:string})=>knownHosts.includes(hostHeader)?{...model,kind:'tenant'}:model},
});

test('actual Next16 login page awaits searchParams before passing the sole purchase hint',async()=>{
 const result=await LoginPage({searchParams:Promise.resolve({purchase:'toshi-test-1'})});
 assert.equal(result.props.purchaseHint,'toshi-test-1');
 assert.equal(result.props.model,model);
});

test('actual login page retains default login for absent, duplicate or extra promised parameters',async()=>{
 for(const query of [{},{purchase:['toshi-test-1','toshi-test-1']},{purchase:'toshi-test-1',returnTo:'https://evil.example'},{purchase:'toshi-500'}]){
  const result=await LoginPage({searchParams:Promise.resolve(query)});
  assert.equal(result.props.purchaseHint,undefined);
  assert.equal(result.props.model,model);
 }
 assert.equal((await LoginPage({})).props.purchaseHint,undefined);
});

test('all paid links keep plan and period at sign-in and skip sign-in for an authenticated session',async()=>{
 const owner=process.env.CELEBIX_OWNER_ORIGIN;
 process.env.CELEBIX_OWNER_ORIGIN='https://owner.saas-staging.celebix.net';
 host=knownHosts[0];
 try{
  for(const purchase of ['starter','growth','professional']) for(const term of ['monthly','annual']){
   const searchParams=Promise.resolve({purchase,term});
   const query='?purchase='+purchase+'&term='+term;
   authenticated=false;
   const result=await LoginPage({searchParams});
   assert.equal(result.props.purchaseHint,purchase+':'+term);
   assert.equal(result.props.signupHref,'https://owner.saas-staging.celebix.net/kayit'+query);
   authenticated=true;
   await assert.rejects(LoginPage({searchParams}),{message:'/settings/plan'+query+'#plan-checkout'});
  }
 }finally{
  authenticated=false;host=centralHost;
  if(owner===undefined) delete process.env.CELEBIX_OWNER_ORIGIN;
  else process.env.CELEBIX_OWNER_ORIGIN=owner;
 }
});

test('central paid entry can resume host-only sessions through a verified store panel',async()=>{
 const saved=process.env.CELEBIX_PANEL_ORIGIN;
 process.env.CELEBIX_PANEL_ORIGIN=`https://${centralHost}`;
 const selection={purchase:'growth',term:'monthly'};
 const visit=(store?:string)=>LoginPage({searchParams:Promise.resolve(store===undefined?selection:{...selection,store})});
 try{
  assert.deepEqual((await visit()).props.packageStore,{code:'growth',term:'monthly',invalid:false});
  for(const [store,target] of [['market',knownHosts[0]],['admin.market.example',knownHosts[1]]]){
   await assert.rejects(visit(store),{message:`https://${target}/login?purchase=growth&term=monthly`});
  }
  for(const store of ['unknown','admin.unknown.example','https://admin.market.example']){
   assert.deepEqual((await visit(store)).props.packageStore,{code:'growth',term:'monthly',invalid:true});
  }
 }finally{
  if(saved===undefined) delete process.env.CELEBIX_PANEL_ORIGIN;
  else process.env.CELEBIX_PANEL_ORIGIN=saved;
 }
});
