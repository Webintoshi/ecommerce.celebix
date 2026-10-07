import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {startAccountingFixture} from '../accounting-ledger/fixture.mjs';
const fixture=startAccountingFixture(218);
try {
 const behavior=readFileSync(new URL('./orders-reader-v2.sql',import.meta.url),'utf8');
 const red=fixture.sql(behavior,true);
 assert.notEqual(red.status,0); assert.match(red.stderr,/ORDERS_READER_V2_ABSENT/); console.log('PASS RED: corrected customer order reader absent');
 fixture.apply('202610070219_order_customer_sales_reader_v2.up.sql');
 fixture.apply('202610070219_order_customer_sales_reader_v2_assertions.sql');
 fixture.sql(behavior); console.log('PASS GREEN: actual customer update/clear/archive, normalized current/history search, guests, tenant boundary and historic address snapshots');
 fixture.apply('202610070219_order_customer_sales_reader_v2.down.sql');
 assert.equal(fixture.value("SELECT to_regprocedure('saas.orders_get_v2(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid)') IS NULL"),'t');
 fixture.apply('202610070219_order_customer_sales_reader_v2.up.sql'); fixture.apply('202610070219_order_customer_sales_reader_v2_assertions.sql'); fixture.sql(behavior);
 console.log('PASS reader rollback/reapply; legacy reader unchanged');
} finally { fixture.stop(); }
