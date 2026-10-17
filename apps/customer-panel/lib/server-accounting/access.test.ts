import assert from 'node:assert/strict';
import test from 'node:test';
import { COMMERCIAL_PACKAGES, type TenantContext } from '@celebix/saas-contracts';
import { compile } from '../../components/settings/design/design-editor-test-utils.ts';

function context(role: string, tier = 3): TenantContext {
  const plan = COMMERCIAL_PACKAGES[tier]!;
  return { membership: { role }, entitlements: { schemaVersion: 1, planId: plan.id, planCode: plan.code, version: plan.version, status: 'active', features: plan.features, limits: plan.limits, validFrom: '2026-01-01T00:00:00.000Z' } } as TenantContext;
}
function loader(read: (input: unknown) => Promise<unknown>) {
  return compile<{ resolvePanelAccountingAccess(context: TenantContext): Promise<unknown> }>(new URL('./access.ts', import.meta.url), {
    'server-only': {},
    react: { cache: (fn: unknown) => fn },
    '../server-panel-access/default.ts': { resolveDefaultServerPanelAccessRuntime: async () => ({}) },
    './runtime.ts': { resolveServerAccountingRuntime: () => ({ accounting: { access: read } }) },
  }).resolvePanelAccountingAccess;
}
const NONE = { canManageAccounting: false, canCollectReceivables: false };

test('cashier presentation reads the native own-membership grant and subsequent requests observe revocation', async () => {
  const actor = context('cashier'); let enabled = true, calls = 0;
  const resolve = loader(async (input: any) => { calls++; assert.equal(input.tenantContext, actor); assert.ok(input.now instanceof Date); return { canManageAccounting: enabled, canCollectReceivables: enabled }; });
  assert.deepEqual(await resolve(actor), { canManageAccounting: true, canCollectReceivables: true });
  enabled = false; assert.deepEqual(await resolve(actor), NONE); assert.equal(calls, 2);
});
test('package and role boundaries deny before any delegated permission query', async () => {
  let calls = 0; const resolve = loader(async () => { calls++; throw Error('must not query'); });
  for (const role of ['store_owner', 'admin']) assert.deepEqual(await resolve(context(role)), { canManageAccounting: true, canCollectReceivables: true });
  for (const actor of [context('editor'), context('cashier', 2), context('admin', 2)]) assert.deepEqual(await resolve(actor), NONE);
  assert.equal(calls, 0);
});
test('unavailable, forged and malformed native permission results fail closed', async () => {
  for (const value of [null, { canManageAccounting: true }, { canManageAccounting: 'true', canCollectReceivables: true }, { canManageAccounting: true, canCollectReceivables: true, storeId: 'other' }]) {
    assert.deepEqual(await loader(async () => value)(context('cashier')), NONE);
  }
  assert.deepEqual(await loader(async () => { throw Error('private connection data'); })(context('cashier')), NONE);
});
