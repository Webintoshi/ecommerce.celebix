import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Pool} from 'pg';
import type {TenantContext} from '@celebix/saas-contracts';
import {PostgresOrderRepository} from '../../../packages/saas-data/src/orders/repository.ts';
import {PostgresInStoreSalesRepository} from '../../../packages/saas-data/src/in-store-sales/repository.ts';
import {startAccountingFixture} from '../accounting-ledger/fixture.mjs';
const fixture=startAccountingFixture(185);
let pool:Pool|undefined;
try {
 fixture.apply('202610020200_accounting_ledger.up.sql');fixture.apply('202610020201_in_store_credit_sales.up.sql');
 fixture.sql(readFileSync(new URL('./credit-sales-v3.sql',import.meta.url),'utf8').replace(/ROLLBACK;\s*$/,'COMMIT;'));
 pool=new Pool(fixture.connection);
 const repository=new PostgresInStoreSalesRepository({pool,role:'celebix_saas_app',timeouts:{poolCheckoutMs:5000,statementMs:5000,lockMs:2000,idleTransactionMs:5000}});
 const store='a2010000-0000-4000-8000-000000000001',principal='a2010000-0000-4000-8000-000000000002',membership='a2010000-0000-4000-8000-000000000003',plan='a2010000-0000-4000-8000-000000000004';
 const authority={tenantContext:{schemaVersion:1,requestId:'a2010000-0000-4000-8000-000000000099',principal:{id:principal,issuer:'https://qa.celebix.invalid',subject:'pos201'},store:{id:store,slug:'pos-credit-regression-201',status:'active'},membership:{id:membership,role:'store_owner',status:'active'},entitlements:{schemaVersion:1,planId:plan,planCode:'pos201_qa',version:1,status:'active',features:['orders','catalog'],limits:{products:100,staff:5,storageBytes:1024},validFrom:'2026-10-01T00:00:00.000Z'},locale:'tr-TR'} as TenantContext,now:new Date('2026-10-02T14:00:00.000Z'),contractVersion:3 as const};
 const sale=await repository.getSale({...authority,saleId:'a2010000-0000-4000-8000-000000000010'});
 assert.equal(sale.customer?.firstName,'Ali');assert.equal(sale.initialCollectionCents,500000);assert.equal(sale.finance?.dueCents,600000);assert.equal(sale.finance?.receipts[0]?.actorMembershipId,'a2010000-0000-4000-8000-000000000040');assert.equal(sale.finance?.receipts[0]?.reversed,false);
 assert.equal((await repository.bootstrap(authority)).recentSales.length,3);
 assert.equal((await repository.searchCustomers({...authority,query:'Changed',limit:20})).customers[0]?.archived,true);
 const orders=new PostgresOrderRepository({pool,role:'celebix_saas_app',timeouts:{poolCheckoutMs:5000,statementMs:5000,lockMs:2000,idleTransactionMs:5000},generateId:()=>membership,audit:()=>{}});
 const bankOrder=fixture.value("SELECT order_id::text FROM saas.in_store_sales WHERE store_id='"+store+"' AND payment_method='bank_transfer'");
 const order=await orders.getOrder({tenantContext:authority.tenantContext,now:authority.now,orderId:bankOrder,inStoreVersion:2});assert.equal(order.inStorePaymentMethod,'bank_transfer');assert.equal(order.paymentStatus,'completed');
 const replay=await repository.getOperation({...authority,operationId:'a2010000-0000-4000-8000-000000000017'});assert.equal(replay?.sale.status,'payment_received');assert.equal(replay?.sale.initialCollectionCents,500000);assert.equal(replay?.replayed,true);
 const down=fixture.sql(readFileSync(new URL('../../../apps/owner/scripts/sql/saas/202610020201_in_store_credit_sales.down.sql',import.meta.url),'utf8'),true);assert.notEqual(down.status,0);assert.match(down.stderr,/IN_STORE_V3_ROLLBACK_DURABLE_DATA_PRESENT/);
 console.log('PASS actual PostgreSQL app role V3 public parser, archived CRM search, bootstrap, immutable replay and durable rollback gate');
} finally {await pool?.end();fixture.stop();}
