import test from 'node:test';
import assert from 'node:assert/strict';
import {createCelebixAdminPasswordLogin,emitCelebixAdminPasswordAmr} from './admin-password-proof.mjs';

const recordId='a'.repeat(21),now=Date.parse('2026-10-12T12:00:00.000Z');
const params={client_id:'1n93icpphr11h4fmrup9w',resource:'urn:celebix:admin-signin-proof',scope:'openid signin:proof'};
const password=(id=recordId,userId='same-user')=>({id,type:'Password',isVerified:true,identifyUser:async()=>({id:userId})});
const input=(extra={})=>({user:{id:'same-user'},params,now,interactionEvent:'SignIn',records:[password()],...extra});
test('only the current verified Password belonging to the submitted user emits a fixed login method',async()=>{
 const login=await createCelebixAdminPasswordLogin(input());
 assert.deepEqual(login,{accountId:'same-user',ts:Math.floor(now/1000),amr:['pwd',`celebix:admin-password-record:${recordId}`]});
 for(const records of [[],[password(recordId,'another-user')],[{...password(),isVerified:false}],[password(),password('b'.repeat(21))],[{...password(),id:'invalid'}]]) {
  assert.deepEqual((await createCelebixAdminPasswordLogin(input({records}))).amr,[]);
 }
 for(const interactionEvent of ['Register','Unknown']) assert.deepEqual((await createCelebixAdminPasswordLogin(input({interactionEvent}))).amr,[]);
});
test('ordinary applications, resources and scopes retain the exact old login payload',async()=>{
 for(const changed of [{client_id:'other-client'},{resource:'another-resource'},{resource:[params.resource]},{scope:'openid'}]) {
  let reads=0;const record={...password(),identifyUser:async()=>{reads++;throw Error('must not read');}};
  assert.deepEqual(await createCelebixAdminPasswordLogin(input({params:{...params,...changed},records:[record]})),{accountId:'same-user'});assert.equal(reads,0);
 }
});
test('a code snapshot emits its exact method through the existing signed ID-token setter',()=>{
 const emitted=[];const token={set:(key,value)=>emitted.push([key,value])};
 const values={clientId:params.client_id,audience:params.resource,scope:params.scope,codeAmr:['pwd',`celebix:admin-password-record:${recordId}`],token};
 emitCelebixAdminPasswordAmr(values);assert.deepEqual(emitted,[['amr',values.codeAmr]]);assert.notEqual(emitted[0][1],values.codeAmr);
 for(const change of [{clientId:'other'},{audience:'other'},{scope:'openid'},{codeAmr:['pwd']},{codeAmr:['pwd',values.codeAmr[1],'extra']},{codeAmr:['social',values.codeAmr[1]]}]) {emitted.length=0;emitCelebixAdminPasswordAmr({...values,...change});assert.deepEqual(emitted,[]);}
});
test('concurrent password and social interactions retain distinct immutable authorization method snapshots',async()=>{
 const passwordLogin=await createCelebixAdminPasswordLogin(input());
 const socialLogin=await createCelebixAdminPasswordLogin(input({records:[{type:'Social'}]}));
 // Logto merges each interaction's lastSubmission.login into its own consent
 // result, then reapplies it before snapshotting that code's authTime and AMR.
 const merge=(lastSubmission,result)=>({...lastSubmission,...result});
 const passwordConsent=merge({login:passwordLogin},{consent:{grantId:'grant'}});
 const socialConsent=merge({login:socialLogin},{consent:{grantId:'grant'}});
 const codeFor=result=>({amr:structuredClone(result.login.amr),authTime:result.login.ts});
 const passwordCode=codeFor(passwordConsent),socialCode=codeFor(socialConsent);
 // A later mutable session-context overwrite cannot turn codeS into codeP.
 const emitted=[];const token={set:(key,value)=>emitted.push([key,value])};
 emitCelebixAdminPasswordAmr({clientId:params.client_id,audience:params.resource,scope:params.scope,codeAmr:socialCode.amr,token});assert.deepEqual(emitted,[]);
 emitCelebixAdminPasswordAmr({clientId:params.client_id,audience:params.resource,scope:params.scope,codeAmr:passwordCode.amr,token});assert.equal(emitted[0][1][1],`celebix:admin-password-record:${recordId}`);assert.equal(passwordCode.authTime,Math.floor(now/1000));
});
