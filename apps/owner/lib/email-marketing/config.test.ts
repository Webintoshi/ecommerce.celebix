import test from 'node:test';
import assert from 'node:assert/strict';
const api = await import('./config.ts').catch(() => ({})) as typeof import('./config.ts');
test('worker modes default off and reject unsupported automatic activation', () => { assert.equal(typeof api.resolveEmailMarketingWorkerMode, 'function'); assert.equal(api.resolveEmailMarketingWorkerMode({}), 'off'); assert.equal(api.resolveEmailMarketingWorkerMode({ CELEBIX_EMAIL_MARKETING_WORKER_MODE: 'revoke_only' }), 'revoke_only'); assert.throws(() => api.resolveEmailMarketingWorkerMode({ CELEBIX_EMAIL_MARKETING_WORKER_MODE: 'true' })); });
