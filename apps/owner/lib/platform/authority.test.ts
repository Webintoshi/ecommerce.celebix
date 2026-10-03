import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyPlatformIdentity } from './authority.ts';

const issuer='https://owner-auth.example.test/auth/v1';
const user={id:'00000000-0000-4000-8000-000000000009',email:'sdkahmetcelebi@icloud.com',email_confirmed_at:'2026-10-04T09:00:00Z'};
const claims={iss:issuer,sub:user.id,aal:'aal2',aud:'authenticated',amr:[{method:'password'},{method:'totp'}]};
const registered={operatorId:'00000000-0000-4000-8000-000000000001',principalId:'00000000-0000-4000-8000-000000000002',issuer,subject:user.id,active:true,label:'Cemo owner',version:1};
test('only verified immutable identity and active registry grant platform authority',()=>{
 assert.equal(classifyPlatformIdentity(user,claims,registered,issuer).kind,'authorized');
 assert.equal(classifyPlatformIdentity({...user,user_metadata:{role:'super_admin'}},claims,null,issuer).kind,'forbidden');
 assert.equal(classifyPlatformIdentity(user,claims,{...registered,active:false},issuer).kind,'forbidden');
 assert.equal(classifyPlatformIdentity(user,{...claims,sub:'another'},registered,issuer).kind,'forbidden');
 assert.equal(classifyPlatformIdentity(user,{...claims,iss:'https://attacker.test/auth/v1'},registered,issuer).kind,'forbidden');
 assert.equal(classifyPlatformIdentity({...user,email_confirmed_at:null},claims,registered,issuer).kind,'unverified');
});
test('registered AAL1 identity can enroll MFA but never access platform commands',()=>{
 assert.equal(classifyPlatformIdentity(user,{...claims,aal:'aal1'},registered,issuer).kind,'mfa_required');
 assert.equal(classifyPlatformIdentity(user,{...claims,aal:undefined},registered,issuer).kind,'mfa_required');
 assert.equal(classifyPlatformIdentity(null,claims,registered,issuer).kind,'unauthenticated');
});

test('email invitation plus TOTP cannot skip the user password requirement',()=>{
 assert.equal(classifyPlatformIdentity(user,{...claims,amr:[{method:'otp'},{method:'totp'}]},registered,issuer).kind,'mfa_required');
 assert.equal(classifyPlatformIdentity(user,{...claims,amr:undefined},registered,issuer).kind,'mfa_required');
});
