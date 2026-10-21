import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
test('WhatsApp setting migration adds authority and reader without changing immutable tariff snapshots',()=>{
 const sql=readFileSync(new URL('./202610210256_whatsapp_ordering.up.sql',import.meta.url),'utf8');
 assert.match(sql,/whatsapp_order_plan_eligible/);assert.match(sql,/configuration\.manage/);assert.match(sql,/merchant_admin_whatsapp_order_singleton_256/);assert.match(sql,/p_expected_version/);assert.match(sql,/merchant_admin_operations/);assert.match(sql,/readers_ready boolean NOT NULL DEFAULT false/);assert.match(sql,/store_policy_public_store\(p_hostname,p_now\)/);assert.match(sql,/GRANT EXECUTE ON FUNCTION saas\.public_whatsapp_order_get\(text,timestamptz\) TO celebix_saas_host_resolver/);
 assert.doesNotMatch(sql,/(?:UPDATE|INSERT INTO|DELETE FROM) saas\.(?:plans|plan_features|plan_limits|platform_plan_prices|commercial_plan_policies)\b/);assert.doesNotMatch(sql,/GRANT (?:ALL|SELECT).*merchant_admin_records/);
});
