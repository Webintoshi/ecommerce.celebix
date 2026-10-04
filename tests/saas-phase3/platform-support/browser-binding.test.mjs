import assert from 'node:assert/strict';
import test from 'node:test';
import {startAccountingFixture} from '../accounting-ledger/fixture.mjs';
import {supportHttpHandlers} from '../../../apps/customer-panel/lib/platform-support/http.ts';
import {supportRedemptionCredential} from '../../../apps/customer-panel/lib/platform-support/credential.ts';
test('native redemption recovers a lost response only for the original browser binding',async()=>{
 const db=startAccountingFixture(209);
 try{
  db.apply('202610040210_platform_support_sales.up.sql');
  db.sql(`BEGIN;
   INSERT INTO saas.principals VALUES('c2100000-0000-4000-8000-000000000001','https://binding.fixture.invalid','binding-operator','sdkahmetcelebi@icloud.com',true,now(),now());
   INSERT INTO saas.platform_operators(id,issuer,subject,principal_id,email,active) VALUES('c2100000-0000-4000-8000-000000000002','https://binding.fixture.invalid','binding-operator','c2100000-0000-4000-8000-000000000001','sdkahmetcelebi@icloud.com',true);
   INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at) VALUES('c2100000-0000-4000-8000-000000000003','Binding fixture','binding-fixture','active','tr','TRY','hemenaku',now(),now());
   INSERT INTO saas.admin_domains(id,store_id,hostname,kind,status,canonical,verified_at,created_at,updated_at,management) VALUES(gen_random_uuid(),'c2100000-0000-4000-8000-000000000003','binding.admin.example.test','platform_subdomain','active',true,now(),now(),now(),'platform');
   COMMIT;`);
  const issued=JSON.parse(db.value("SELECT saas.platform_support_issue('c2100000-0000-4000-8000-000000000002','c2100000-0000-4000-8000-000000000003','binding.admin.example.test','Browser-bound support test',1,'binding-native-fixture',repeat('a',64))"));
  const host='binding.admin.example.test',bindingA='b'.repeat(64),bindingB='c'.repeat(64),key=Buffer.alloc(32,7).toString('base64url'),calls=[];let lost=false;
  const derive=(handoff,hostname,binding)=>supportRedemptionCredential(handoff,hostname,binding,key);
  const handlers=supportHttpHandlers(async(action,values)=>{
   assert.equal(action,'redeem');calls.push(values);
   const quote=value=>"'"+String(value).replaceAll("'","''")+"'";
   const result=JSON.parse(db.value('SET ROLE celebix_saas_support_runtime; SELECT saas.platform_support_redeem('+values.map(quote).join(',')+')'));
   if(!lost){lost=true;throw Error('commit response lost');}return result;
  },derive);
  const request=binding=>new Request('http://127.0.0.1:3000/api/support/redeem',{method:'POST',headers:{host,origin:`https://${host}`,'Content-Type':'application/json'},body:JSON.stringify({handoff:issued.handoff,browserBinding:binding})});
  assert.equal((await handlers.redeemSupport(request(bindingA))).status,503);
  const recovered=await handlers.redeemSupport(request(bindingA));assert.equal(recovered.status,200);
  const cookie=recovered.headers.get('Set-Cookie');assert.match(cookie,new RegExp(`^__Host-celebix_support=${derive(issued.handoff,host,bindingA)};`));
  const secondBrowser=await handlers.redeemSupport(request(bindingB));assert.equal(secondBrowser.status,503);assert.equal(secondBrowser.headers.get('Set-Cookie'),null);
  assert.deepEqual(calls[0],calls[1]);assert.notEqual(calls[1][2],calls[2][2]);assert.equal(calls.flat().includes(bindingA),false);assert.equal(calls.flat().includes(bindingB),false);
  assert.equal(db.value("SELECT count(*) FROM saas.platform_support_sessions"),'1');assert.equal(db.value("SELECT count(*) FROM saas.platform_audit WHERE action='support.redeem'"),'1');
  const stored=JSON.parse(db.value("SELECT jsonb_build_object('expiresAt',expires_at,'hash',credential_hash,'plainBinding',(to_jsonb(s)::text LIKE '%"+bindingA+"%' OR to_jsonb(s)::text LIKE '%"+bindingB+"%')) FROM saas.platform_support_sessions s"));
  assert.equal(stored.expiresAt,issued.expiresAt);assert.equal(stored.plainBinding,false);
 }finally{db.stop();}
});
