import assert from 'node:assert/strict';
import test from 'node:test';
import type { CatalogAdminRepository, PostgresOrderBumpAdminRepository } from '@celebix/saas-data';
import type { ServerPanelAccessRuntime } from '../server-panel-access/runtime.ts';
import { registerServerCatalogAdminRepository } from '../server-catalog-admin/runtime.ts';
import { registerServerOrderBumpRepository, resolveServerOrderBumpRuntime } from './runtime.ts';

function access(mode: 'approved_staging' | 'disabled' = 'approved_staging'): ServerPanelAccessRuntime {
  return {
    readiness: { mode }, panelOrigin: mode === 'approved_staging' ? 'https://panel.saas-staging.celebix.net' : null,
    async resolveCredential() { return { kind: 'unauthenticated' }; },
    async rotateCredential() { return { kind: 'unavailable' }; },
    async revokeCredential() { return { kind: 'unavailable' }; },
  };
}
function catalog() {
  const unused = async () => { throw new Error('unused'); };
  return Object.fromEntries(['listResources', 'getResource', 'saveResource', 'archiveResource', 'listReviews', 'moderateReview', 'listImports', 'importProducts', 'importProductsV2', 'authorizeFeedPreview', 'prepareImport', 'getImportPreview', 'commitImportPreview'].map(key => [key, unused])) as unknown as CatalogAdminRepository;
}
function repository() {
  const unused = async () => { throw new Error('unused'); };
  return { get: unused, save: unused, options: unused } as Pick<PostgresOrderBumpAdminRepository, 'get' | 'save' | 'options'>;
}
test('order bump runtime requires the existing authenticated catalog runtime and hides private repository state', () => {
  const approved = access();
  registerServerOrderBumpRepository(approved, { ...repository(), pool: 'private' } as ReturnType<typeof repository>);
  assert.equal(resolveServerOrderBumpRuntime(approved), null);
  registerServerCatalogAdminRepository(approved, catalog());
  const runtime = resolveServerOrderBumpRuntime(approved);
  assert.ok(runtime);
  assert.equal(runtime.access, approved);
  assert.equal(Object.isFrozen(runtime.orderBumps), true);
  assert.deepEqual(Object.keys(runtime.orderBumps), ['get', 'save', 'options']);
  assert.equal('pool' in runtime.orderBumps, false);
  assert.equal(resolveServerOrderBumpRuntime(access()), null);
});
test('disabled, malformed and duplicate repository registrations fail closed', () => {
  assert.equal(resolveServerOrderBumpRuntime(access('disabled')), null);
  assert.throws(() => registerServerOrderBumpRepository(access('disabled'), repository()));
  const approved = access();
  assert.throws(() => registerServerOrderBumpRepository(approved, {} as ReturnType<typeof repository>));
  registerServerOrderBumpRepository(approved, repository());
  assert.throws(() => registerServerOrderBumpRepository(approved, repository()));
});
