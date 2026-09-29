import assert from 'node:assert/strict';
import test from 'node:test';
import { merchantContentReady } from './readiness.ts';

test('typed content readiness checks sidecar and all three executable RPCs without blocking the panel', async () => {
  let sql = '';
  const pool = { async query(text: string) { sql = text; return { rowCount: 1, rows: [{ ready: true }] }; } };
  assert.equal(await merchantContentReady(pool as never), true);
  for (const expected of ['merchant_content_bodies', 'merchant_content_versions', 'merchant_content_get(', 'merchant_content_save(', 'merchant_content_versions(']) {
    assert.ok(sql.includes(expected), expected);
  }
  assert.match(sql, /has_function_privilege\('celebix_saas_app'/);
  assert.doesNotMatch(sql, /INSERT|UPDATE|DELETE|CREATE|SET ROLE/i);
  assert.equal(await merchantContentReady({ query: async () => ({ rowCount: 1, rows: [{ ready: false }] }) } as never), false);
  assert.equal(await merchantContentReady({ query: async () => ({ rowCount: 0, rows: [] }) } as never), false);
});
