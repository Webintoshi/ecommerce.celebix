import assert from 'node:assert/strict';
import test from 'node:test';
import type { MerchantAdminRecord, TenantContext } from '@celebix/saas-contracts';
import { buildPolicyMerchantFacts, loadPolicyMerchantFacts } from './facts.ts';

const id = '11111111-1111-4111-8111-111111111111';
const record = (kind: MerchantAdminRecord['kind'], config: MerchantAdminRecord['config'], status: MerchantAdminRecord['status'] = 'active'): MerchantAdminRecord => ({ id, kind, name: 'Kayıt', config, status, version: 1, createdAt: '2026-10-30T00:00:00.000Z', updatedAt: '2026-10-30T00:00:00.000Z' });
test('facts use only stored active allowlisted values and do not infer legal identity or address', () => {
  const facts = buildPolicyMerchantFacts([record('general_setting', { storeDisplayName: 'Örnek Mağaza', supportEmail: 'destek@example.test', timezone: 'Europe/Istanbul', skuPrefix: 'SECRET' }), record('accounting_profile', { legalName: 'Örnek Ticaret Ltd.', taxNumber: '1234567890', invoiceEmail: 'fatura@example.test' }), record('shipping_setting', { estimatedDays: 3, regions: ['Türkiye'], shippingPriceCents: 5000 }), record('general_setting', { storeDisplayName: 'Eski Mağaza' }, 'draft')], 'kvkk');
  const serialized = JSON.stringify(facts);
  assert.match(serialized, /Örnek Mağaza/u); assert.match(serialized, /Örnek Ticaret Ltd/u); assert.equal(serialized.includes('SECRET'), false); assert.equal(serialized.includes('Eski Mağaza'), false); assert.equal(serialized.includes('1234567890'), false);
  assert.equal(facts.facts.some(fact => /adres/iu.test(fact.label)), false);
  assert.equal(facts.missing.some(note => /adres/iu.test(note)), true);
});
test('shipping money facts use exact lira amounts rather than exposing cents as lira', () => {
  const result = buildPolicyMerchantFacts([record('shipping_setting', { shippingPriceCents: 9000, freeShippingThresholdCents: 150055 })], 'payment_delivery');
  assert.equal(result.facts.find(fact => fact.ref.endsWith(':shippingPriceCents'))?.value, '90,00 TL');
  assert.equal(result.facts.find(fact => fact.ref.endsWith(':freeShippingThresholdCents'))?.value, '1500,55 TL');
  assert.equal(result.facts.some(fact => fact.label.includes('kuruş')), false);
});
test('missing data remains review notes and duplicate profiles do not select arbitrary identity', () => {
  const result = buildPolicyMerchantFacts([record('general_setting', { storeDisplayName: 'Bir' }), record('general_setting', { storeDisplayName: 'İki' })], 'distance_sales');
  assert.equal(result.facts.length, 0); assert.ok(result.missing.some(note => /kimli|unvan/iu.test(note))); assert.ok(result.missing.some(note => /adres/iu.test(note)));
});
test('accounting metadata is not requested without the existing commercial entitlement', async () => {
  const kinds: string[] = [], tenantContext = { store: { id } } as TenantContext;
  const result = await loadPolicyMerchantFacts({ merchantAdmin: { async list(input) { assert.equal(input.tenantContext.store.id, id); kinds.push(input.kind); return input.kind === 'general_setting' ? [record('general_setting', { storeDisplayName: 'Mağaza' })] : []; } }, tenantContext, now: new Date(), policyKey: 'cookie_usage', includeAccounting: false });
  assert.equal(kinds.includes('accounting_profile'), false); assert.ok(result.missing.some(note => /çerez/iu.test(note)));
});
test('optional accounting denial omits private facts without widening access or hiding other read failures', async () => {
  const common = { tenantContext: { store: { id } } as TenantContext, now: new Date(), policyKey: 'kvkk' as const, includeAccounting: true };
  const allowed = await loadPolicyMerchantFacts({ ...common, merchantAdmin: { async list(input) { if (input.kind === 'accounting_profile') throw Object.assign(Error(), { code: 'feature_not_enabled' }); return []; } } });
  assert.equal(allowed.facts.length, 0);
  await assert.rejects(loadPolicyMerchantFacts({ ...common, merchantAdmin: { async list() { throw Object.assign(Error(), { code: 'unavailable' }); } } }), { code: 'unavailable' });
});
