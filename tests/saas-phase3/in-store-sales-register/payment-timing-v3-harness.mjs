import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {startAccountingFixture} from '../accounting-ledger/fixture.mjs';

const fixture=startAccountingFixture(207);
const signature='saas.in_store_sales_mutate_v3(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text,jsonb)';
const snapshot=()=>fixture.value(`SELECT json_build_object('oid',p.oid,'definition',pg_get_functiondef(p.oid),'owner',p.proowner,'acl',p.proacl,'config',p.proconfig,'hash',encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')) FROM pg_proc p WHERE p.oid='${signature}'::regprocedure`);
try {
 const before=snapshot();
 const test=readFileSync(new URL('./payment-timing-v3.sql',import.meta.url),'utf8');
 const red=fixture.sql(test,true);
 assert.notEqual(red.status,0);
 assert.match(red.stderr,/orders_commerce_payment_timestamps_check/);
 console.log('PASS RED: elapsed full collection fails the actual order timestamp constraint');
 fixture.apply('202610030208_in_store_payment_timing.up.sql');
 fixture.apply('202610030208_in_store_payment_timing_assertions.sql');
 fixture.sql(test);
 console.log('PASS GREEN: elapsed full collection, partial return/refund, zero/later collection, replay, immutable receipt and stock once');
 fixture.apply('202610030208_in_store_payment_timing.down.sql');
 assert.equal(snapshot(),before);
 assert.equal(fixture.value("SELECT to_regclass('saas.in_store_payment_timing_208_backup') IS NULL"),'t');
 console.log('PASS DOWN: exact predecessor definition/hash/OID/owner/ACL restored');
 fixture.apply('202610030208_in_store_payment_timing.up.sql');
 fixture.apply('202610030208_in_store_payment_timing_assertions.sql');
 console.log('PASS REAPPLY: exact patch and authority assertions');
} finally {fixture.stop();}
