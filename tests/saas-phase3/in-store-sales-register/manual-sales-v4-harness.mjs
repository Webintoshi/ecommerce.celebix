import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {parseInStoreBootstrap,parseInStoreSale} from '../../../packages/saas-contracts/src/in-store-sales/index.ts';
import {parseOrderDetailV2} from '../../../packages/saas-contracts/src/orders/index.ts';
import {verifyV4Concurrency} from './manual-sales-v4-concurrency.mjs';
import {startAccountingFixture} from '../accounting-ledger/fixture.mjs';
const manifestSQL=`SELECT coalesce(jsonb_object_agg(signature,jsonb_build_object('definitionMd5',definition_md5,'owner',owner,'acl',acl,'securityDefiner',security_definer,'config',config) ORDER BY signature),'{}') FROM (SELECT p.oid::regprocedure::text signature,md5(pg_get_functiondef(p.oid)) definition_md5,pg_get_userbyid(p.proowner) owner,p.proacl::text acl,p.prosecdef security_definer,to_jsonb(p.proconfig) config FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='saas') manifest;`;
const evidence=process.env.MANUAL_V4_EVIDENCE_DIR??'/tmp/celebix-manual-sales-v4-evidence';mkdirSync(evidence,{recursive:true});
const fixture=startAccountingFixture(217);
try {
 const test=readFileSync(new URL('./manual-sales-v4.sql',import.meta.url),'utf8');
 if(process.argv.includes('--red')){const red=fixture.sql(test,true);assert.notEqual(red.status,0);assert.match(red.stderr,/manual_sales_v4_enabled/);console.log('PASS RED: v4 native release/receipts unavailable');}
 else{
  const before=JSON.parse(fixture.value(manifestSQL));writeFileSync(path.join(evidence,'217-functions.json'),JSON.stringify(before,null,2)+'\n');
  fixture.apply('202610070218_manual_sales_v4.up.sql');fixture.apply('202610070218_manual_sales_v4_assertions.sql');
  fixture.apply('202610070219_order_customer_sales_reader_v2.up.sql');fixture.apply('202610070219_order_customer_sales_reader_v2_assertions.sql');
  const payloads=fixture.sql(test).stdout.trim().split('\n').map(x=>JSON.parse(x));for(const {purpose,payload} of payloads){if(purpose.startsWith('bootstrap'))parseInStoreBootstrap(payload,purpose==='bootstrap'?4:Number(purpose.slice(-1))); else if(purpose.startsWith('sale'))parseInStoreSale(payload,purpose==='sale'?4:Number(purpose.slice(-1)));else if(purpose==='order')parseOrderDetailV2(payload);}
  fixture.sql(readFileSync(new URL('./orders-reader-v2.sql',import.meta.url),'utf8'));
  for(const file of ['payment-timing-v3.sql','credit-sales-v3.sql','price-payment-v2.sql'])fixture.sql(readFileSync(new URL('./'+file,import.meta.url),'utf8'));
  const after=JSON.parse(fixture.value(manifestSQL));writeFileSync(path.join(evidence,'219-functions.json'),JSON.stringify(after,null,2)+'\n');
  const changed=Object.keys(before).filter(k=>JSON.stringify(before[k])!==JSON.stringify(after[k]));const expected=JSON.parse(fixture.value("SELECT jsonb_agg(signature ORDER BY signature) FROM saas.manual_sales_v4_restore;"));assert.deepEqual(changed.sort(),expected.sort());
  const added=Object.keys(after).filter(k=>!(k in before));writeFileSync(path.join(evidence,'function-diff.json'),JSON.stringify({changed,added},null,2)+'\n');
  fixture.apply('202610070219_order_customer_sales_reader_v2.down.sql');fixture.apply('202610070218_manual_sales_v4.down.sql');assert.deepEqual(JSON.parse(fixture.value(manifestSQL)),before);
  fixture.apply('202610070218_manual_sales_v4.up.sql');fixture.apply('202610070219_order_customer_sales_reader_v2.up.sql');fixture.sql(test.replace(/ROLLBACK;\s*$/,'COMMIT;'));await verifyV4Concurrency(fixture);
  console.log('PASS V4 split cash/card/bank, immediate ledger, pending refund, debt revision, shipping guards, old ABI, reader219, rollback/reapply');console.log(`Function receipts: ${evidence}; changed=${changed.length}; added=${added.length}`);
 }
}finally{fixture.stop();}
