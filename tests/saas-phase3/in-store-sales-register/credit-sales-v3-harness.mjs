import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {startAccountingFixture} from '../accounting-ledger/fixture.mjs';
const fixture=startAccountingFixture();
try {
 fixture.apply('202610020200_accounting_ledger.up.sql');
 const baseline=fixture.sql(readFileSync(new URL('./credit-sales-v3.sql',import.meta.url),'utf8'),true);
 assert.notEqual(baseline.status,0);assert.match(baseline.stderr,/V3 frozen credit sale preparation absent/);console.log('PASS baseline RED: V3 preparation absent');
 fixture.apply('202610020201_in_store_credit_sales.up.sql');
 fixture.apply('202610020201_in_store_credit_sales_assertions.sql');
 fixture.sql(readFileSync(new URL('./credit-sales-v3.sql',import.meta.url),'utf8'));console.log('PASS actual V3 partial/zero/full/customer/legacy/receipt/stock fixture');
 fixture.sql(readFileSync(new URL('./behavior.sql',import.meta.url),'utf8').replace("now_at timestamptz:='2026-09-26T10:00:00Z'","now_at timestamptz:=transaction_timestamp()"));console.log('PASS actual V1 unchanged register/replay/deletion fixture');
 fixture.sql(readFileSync(new URL('./price-payment-v2.sql',import.meta.url),'utf8'));console.log('PASS actual V2 unchanged price/payment/replay fixture');
 fixture.apply('202610020201_in_store_credit_sales.down.sql');console.log('PASS V3 exact function rollback with no durable V3 data');
 fixture.apply('202610020201_in_store_credit_sales.up.sql');fixture.apply('202610020201_in_store_credit_sales_assertions.sql');console.log('PASS V3 reapply and grants/assertions');
} finally {fixture.stop();}
