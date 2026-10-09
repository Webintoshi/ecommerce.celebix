import assert from 'node:assert/strict';
import test from 'node:test';
const api = await import('./config.ts').catch(() => ({})) as typeof import('./config.ts');
test('optional email feature is disabled unless explicit rollout and keyring are valid', () => { assert.equal(typeof api.emailMarketingConfiguration, 'function'); const ring = { activeKeyId: 'fixture', keys: [{ keyId: 'fixture', key: new Uint8Array(32).fill(1) }] }; assert.equal(api.emailMarketingConfiguration({}, ring).enabled, false); assert.equal(api.emailMarketingConfiguration({ CELEBIX_EMAIL_MARKETING_CONNECTIONS_ENABLED: 'true' }, ring).enabled, true); assert.equal(api.emailMarketingConfiguration({ CELEBIX_EMAIL_MARKETING_CONNECTIONS_ENABLED: 'true' }, { activeKeyId: 'missing', keys: [] }).enabled, false); });

test('Klaviyo rollout requires global authority while Brevo additionally requires its explicit flag', () => {
  const ring = {activeKeyId: 'fixture', keys: [{keyId: 'fixture', key: new Uint8Array(32).fill(1)}]};
  assert.deepEqual((api.emailMarketingConfiguration({}, ring) as any).providerAvailability, {brevo: false, klaviyo: false});
  assert.deepEqual((api.emailMarketingConfiguration({CELEBIX_EMAIL_MARKETING_CONNECTIONS_ENABLED: 'true'}, ring) as any).providerAvailability, {brevo: false, klaviyo: true});
  assert.deepEqual((api.emailMarketingConfiguration({CELEBIX_EMAIL_MARKETING_CONNECTIONS_ENABLED: 'true', CELEBIX_EMAIL_MARKETING_BREVO_ENABLED: 'true'}, ring) as any).providerAvailability, {brevo: true, klaviyo: true});
  assert.deepEqual((api.emailMarketingConfiguration({CELEBIX_EMAIL_MARKETING_BREVO_ENABLED: 'true'}, ring) as any).providerAvailability, {brevo: false, klaviyo: false});
  assert.deepEqual((api.emailMarketingConfiguration({CELEBIX_EMAIL_MARKETING_CONNECTIONS_ENABLED: 'true', CELEBIX_EMAIL_MARKETING_BREVO_ENABLED: 'true'}, {activeKeyId: 'missing', keys: []}) as any).providerAvailability, {brevo: false, klaviyo: false});
});
