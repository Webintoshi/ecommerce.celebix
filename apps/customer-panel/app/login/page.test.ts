import assert from 'node:assert/strict';
import test from 'node:test';
import {compile} from '../../lib/mira-final-test-support.ts';

const model={kind:'generic',displayName:'Celebix',logoUrl:null,accentColor:'#ff6500',canonicalAdminOrigin:null,loginHref:'/auth/login'};
const {default:LoginPage}=compile('app/login/page.tsx',{
 'next/headers':{headers:async()=>new Headers({host:'panel.saas-staging.celebix.net'})},
 '../../components/auth/TenantLogin':{TenantLogin:()=>null},
 '../../lib/server-admin-host-auth/default.ts':{resolveDefaultServerAdminHostAuthRuntime:async()=>null},
 '../../lib/tenant-admin-login-model.ts':{resolveTenantAdminLoginModel:async()=>model},
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
