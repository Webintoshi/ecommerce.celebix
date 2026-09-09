import assert from 'node:assert/strict';
import test from 'node:test';

const moduleUrl = new URL('./atlas-orders-qa-archive.mjs', import.meta.url);
const STORE = 'a828862c-4cc1-475a-89cc-5fbee31eb43f';
const IDS = ['af1982e0-c3f2-5f39-8509-8e0250394b13', '0e8bca85-e87c-5a82-8a4e-d615b6d4df29'];
const CREATED = ['2026-08-01T15:36:36.656Z', '2026-08-01T15:37:26.880Z'];
function detail(id) {
  return {
    id, orderNumber: `MAN-${id.replaceAll('-', '').slice(0,20)}`, source: 'manual',
    createdAt: CREATED[IDS.indexOf(id)], updatedAt: CREATED[IDS.indexOf(id)], version: 1,
    customerName: 'Archive QA', customerEmail: 'qa@example.test', currency: 'TRY',
    totalCents: 9094500, subtotalCents: 9094500, shippingCents: 0, discountCents: 0,
    status: 'confirmed', paymentStatus: 'pending', itemCount: 1,
    shippingAddress: { recipientName: 'Archive QA', line1: 'Fixture only', city: 'Fixture', country: 'TR' },
    items: [{ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', position: 0, productName: 'Fixture', unitPriceCents: 9094500, quantity: 1, discountCents: 0, lineTotalCents: 9094500 }],
    events: [], notes: [],
  };
}

async function subject() {
  try { return await import(moduleUrl); }
  catch (error) { if (error.code === 'ERR_MODULE_NOT_FOUND') return {}; throw error; }
}

function adapter(overrides = {}) {
  const calls = [];
  const archived = new Set();
  const scope = {
    databaseName: 'celebix_saas_staging_auth01', storeSlug: 'guzide-kuyumcu-4',
    tenantContext: {
      schemaVersion: 1, requestId: 'qa-archive-fixture', locale: 'tr-TR',
      store: { id: STORE, slug: 'guzide-kuyumcu-4', status: 'active' },
      principal: { id: '44444444-4444-4444-8444-444444444444', issuer: 'https://identity.example.test', subject: 'fixture' },
      membership: { id: '55555555-5555-4555-8555-555555555555', role: 'store_owner', status: 'active' },
      entitlements: {
        schemaVersion: 1, planId: '66666666-6666-4666-8666-666666666666', planCode: 'merchant_growth', version: 3,
        status: 'active', features: ['orders'], limits: { products: 100, staff: 5, storageBytes: 1024 },
        validFrom: '2026-01-01T00:00:00.000Z', validUntil: '2027-01-01T00:00:00.000Z',
      },
    },
    orders: {
      async getOrder({orderId}) { return detail(orderId); },
      async getArchiveEligibility(input) { calls.push(['read', input.orderId]); return { id: input.orderId, eligible: true, archived: archived.has(input.orderId), blockers: [] }; },
      async archiveOrder(input) { calls.push(['archive', input.orderId]); archived.add(input.orderId); return { id: input.orderId, archived: true, operationId: input.operationId, changedAt: input.now.toISOString(), replayed: false }; },
    },
    ...overrides,
  };
  return { calls, resolveAuthorizedScope: async () => scope };
}

test('default dry-run checks only both exact IDs without writing', async () => {
  const { runOrdersQaArchive } = await subject();
  assert.equal(typeof runOrdersQaArchive, 'function', 'archive runner is not implemented');
  const scope = adapter();
  const result = await runOrdersQaArchive({ resolveAuthorizedScope: scope.resolveAuthorizedScope });
  assert.deepEqual(scope.calls, IDS.map(id => ['read', id]));
  assert.equal(result.mode, 'dry-run');
  assert.equal(result.archivedCount, 0);
  assert.equal(result.results.length, 2);
});

test('historical replay after restore cannot be reported as currently archived', async () => {
  const { runOrdersQaArchive } = await subject();
  const scope = adapter();
  const resolveAuthorizedScope = async () => {
    const resolved = await scope.resolveAuthorizedScope();
    return { ...resolved, orders: { ...resolved.orders, archiveOrder: async input => ({ id: input.orderId, archived: true, operationId: input.operationId, changedAt: input.now.toISOString(), replayed: true }) } };
  };
  await assert.rejects(runOrdersQaArchive({ resolveAuthorizedScope, mode:'apply', evidenceReference:'qa/previous-reviewed-run' }), /archive_state_not_confirmed/);
});

test('wrong database or store fails closed before querying orders', async () => {
  const { runOrdersQaArchive } = await subject();
  assert.equal(typeof runOrdersQaArchive, 'function');
  for (const override of [{ databaseName: 'production' }, { storeSlug: 'other' }, { tenantContext: { store: { id: IDS[0] } } }]) {
    const scope = adapter(override);
    await assert.rejects(runOrdersQaArchive({ resolveAuthorizedScope: scope.resolveAuthorizedScope }), /scope_mismatch/);
    assert.deepEqual(scope.calls, []);
  }
});

test('unresolved authentication and caller-selected IDs are rejected', async () => {
  const { runOrdersQaArchive } = await subject();
  assert.equal(typeof runOrdersQaArchive, 'function');
  await assert.rejects(runOrdersQaArchive({ resolveAuthorizedScope: async () => null }), /authorized_scope_required/);
  const scope = adapter();
  await assert.rejects(runOrdersQaArchive({ resolveAuthorizedScope: scope.resolveAuthorizedScope, orderIds: [IDS[0]] }), /invalid_options/);
  assert.deepEqual(scope.calls, []);
});

test('ineligible target is reported without payload or mutation; other target remains visible', async () => {
  const { runOrdersQaArchive } = await subject();
  assert.equal(typeof runOrdersQaArchive, 'function');
  const scope = adapter({ orders: { async getOrder({orderId}) { return detail(orderId); }, async getArchiveEligibility({orderId}) { return { id: orderId, eligible: orderId !== IDS[0], archived: false, blockers: orderId === IDS[0] ? ['payment_dependency'] : [], customerEmail: 'must-not-leak@example.test' }; } } });
  const result = await runOrdersQaArchive({ resolveAuthorizedScope: scope.resolveAuthorizedScope });
  assert.equal(result.results[0].eligible, false);
  assert.equal(result.results[1].eligible, true);
  assert.doesNotMatch(JSON.stringify(result), /must-not-leak|customerEmail/);
});

test('apply requires explicit mode and evidence; repository rechecks each target', async () => {
  const { runOrdersQaArchive } = await subject();
  assert.equal(typeof runOrdersQaArchive, 'function');
  const scope = adapter();
  await assert.rejects(runOrdersQaArchive({ resolveAuthorizedScope: scope.resolveAuthorizedScope, mode: 'apply' }), /evidence_required/);
  assert.deepEqual(scope.calls, []);
  const result = await runOrdersQaArchive({ resolveAuthorizedScope: scope.resolveAuthorizedScope, mode: 'apply', evidenceReference: 'docs/qa/atlas-orders-qa-archive.md#controlled-release' });
  assert.equal(result.archivedCount, 2);
  assert.deepEqual(scope.calls, IDS.flatMap(id => [['read', id], ['archive', id], ['read', id]]));
});

test('changed target evidence is rejected before archive eligibility or apply', async () => {
  const { runOrdersQaArchive } = await subject();
  for (const changed of [{ totalCents: 1 }, { source: 'storefront' }, { createdAt: '2026-09-09T00:00:00.000Z' }, { customerName: 'Real Customer', customerEmail: 'real@merchant.example' }]) {
    const scope = adapter();
    const resolveAuthorizedScope = async () => {
      const resolved = await scope.resolveAuthorizedScope();
      return { ...resolved, orders: { ...resolved.orders, getOrder: async ({orderId}) => ({...detail(orderId), ...changed}) } };
    };
    await assert.rejects(runOrdersQaArchive({ resolveAuthorizedScope }), /target_evidence_changed/);
    assert.deepEqual(scope.calls, []);
  }
});
