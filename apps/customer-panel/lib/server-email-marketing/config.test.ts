import assert from 'node:assert/strict';
import test from 'node:test';
const api = await import('./config.ts').catch(() => ({})) as typeof import('./config.ts');
test('optional email feature is disabled unless explicit rollout and keyring are valid', () => { assert.equal(typeof api.emailMarketingConfiguration, 'function'); const ring = { activeKeyId: 'fixture', keys: [{ keyId: 'fixture', key: new Uint8Array(32).fill(1) }] }; assert.equal(api.emailMarketingConfiguration({}, ring).enabled, false); assert.equal(api.emailMarketingConfiguration({ CELEBIX_EMAIL_MARKETING_CONNECTIONS_ENABLED: 'true' }, ring).enabled, true); assert.equal(api.emailMarketingConfiguration({ CELEBIX_EMAIL_MARKETING_CONNECTIONS_ENABLED: 'true' }, { activeKeyId: 'missing', keys: [] }).enabled, false); });
