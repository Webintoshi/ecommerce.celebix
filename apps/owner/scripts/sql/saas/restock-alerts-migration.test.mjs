import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
test('restock migration uses sellable stock, bounded exclusive leases and no direct public table grant',()=>{const sql=readFileSync(new URL('./202610030207_restock_alerts.up.sql',import.meta.url),'utf8');assert.match(sql,/in_store_held_quantity/);assert.match(sql,/FOR UPDATE.*SKIP LOCKED/s);assert.match(sql,/interval '24 hours'/);assert.match(sql,/restock_authorize/);assert.doesNotMatch(sql,/GRANT (?:ALL|SELECT|INSERT|UPDATE).*restock_subscriptions/);});
