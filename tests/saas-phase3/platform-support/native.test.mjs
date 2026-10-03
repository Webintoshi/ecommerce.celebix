import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {startAccountingFixture} from '../accounting-ledger/fixture.mjs';
test('native support migration, bounded grants, one-use host binding, expiry, revoke and policy versioning',()=>{
 const db=startAccountingFixture(209);try{db.apply('202610040210_platform_support_sales.up.sql');db.apply('202610040210_platform_support_sales.assertions.sql');db.sql(readFileSync(new URL('./lifecycle.sql',import.meta.url),'utf8'));
 db.sql(readFileSync(new URL('./sales-pause.sql',import.meta.url),'utf8'));
 db.apply('202610040210_platform_support_sales.down.sql');assert.equal(db.value("SELECT to_regprocedure('saas.platform_support_issue(uuid,uuid,text,text,bigint,text,text)') IS NULL"),'t');
 }finally{db.stop();}
});
