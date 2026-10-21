import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { runSignupEdgeReadiness } from './verify-signup-edge.mjs';

function probes(change = {}) {
  const calls = [];
  return {
    calls,
    probeCertificate: async (role, hostname) => {
      calls.push({ kind: 'certificate', role, hostname });
      if (change.untrusted && hostname.endsWith(change.untrusted)) {
        throw Object.assign(new Error('private error must never appear'), { code: 'CERT_HAS_EXPIRED' });
      }
      const suffix = hostname.slice(hostname.indexOf('.') + 1);
      return { role, hostname, subjectAltName: `DNS:*.${change.wrongSan ? suffix.replace('admin.', '') : suffix}`,
        validTo: '2099-01-01T00:00:00.000Z', fingerprint256: 'A'.repeat(64) };
    },
    probeHttp: async (hostname, pathname) => {
      calls.push({ kind: 'http', hostname, pathname });
      const unknown = hostname.startsWith('wildcard-probe-');
      const role = unknown ? (hostname.includes('.admin.') ? 3 : 4)
        : hostname.startsWith('panel.') ? 5 : hostname.startsWith('auth.') ? 6 : hostname.includes('.admin.') ? 1 : 2;
      const unknownStatus = hostname.includes('.admin.') ? change.unknownAdminStatus : change.unknownStorefrontStatus;
      return { hostname, status: unknown ? (unknownStatus ?? (change.acceptUnknown ? 200 : 404)) : 200, bodySha256: String(role).repeat(64) };
    },
  };
}

test('requires NET and SITE known routes and fresh unknown admin/storefront TLS probes', async () => {
  const injected = probes();
  const result = await runSignupEdgeReadiness([], injected);
  assert.equal(result.ok, true);
  assert.deepEqual(result.results.map(row => row.environment), ['staging_net', 'staging']);
  for (const [suffix, known] of [['net', 'hizli-kutu'], ['site', 'guzide-kuyumcu-4']]) {
    const certificateHosts = injected.calls.filter(row => row.kind === 'certificate' && row.hostname.endsWith(`celebix.${suffix}`)).map(row => row.hostname);
    assert.equal(certificateHosts.length, 2);
    assert.ok(certificateHosts.some(host => /^wildcard-probe-[a-z0-9]+\.admin\./u.test(host)));
    assert.ok(certificateHosts.some(host => /^wildcard-probe-[a-z0-9]+\.saas-staging\./u.test(host)));
    assert.ok(injected.calls.some(row => row.kind === 'http' && row.hostname === `${known}.admin.saas-staging.celebix.${suffix}`));
    assert.ok(injected.calls.some(row => row.kind === 'http' && row.hostname === `${known}.saas-staging.celebix.${suffix}`));
  }
});

for (const suffix of ['net', 'site']) {
  test(`untrusted fresh ${suffix} certificate fails even when known tenants work`, async () => {
    const injected = probes({ untrusted: `celebix.${suffix}` });
    const result = await runSignupEdgeReadiness([], injected);
    assert.equal(result.ok, false);
    assert.equal(result.results.find(row => row.environment === (suffix === 'net' ? 'staging_net' : 'staging')).ok, false);
    assert.equal(injected.calls.filter(row => row.kind === 'certificate').length, 4);
    assert.equal(JSON.stringify(result).includes('private error'), false);
  });
}

test('outer storefront wildcard cannot substitute for nested admin wildcard', async () => {
  const result = await runSignupEdgeReadiness([], probes({ wrongSan: true }));
  assert.equal(result.ok, false);
  assert.ok(result.results.every(row => row.errors.includes('admin_certificate_wildcard_missing')));
});

test('unknown tenant acceptance fails combined gate', async () => {
  const result = await runSignupEdgeReadiness([], probes({ acceptUnknown: true }));
  assert.equal(result.ok, false);
  assert.ok(result.results.every(row => row.errors.includes('unknown_admin_tenant_accepted')));
});

for (const [option, error] of [
  ['unknownAdminStatus', 'unknown_admin_app_route_unconfirmed'],
  ['unknownStorefrontStatus', 'unknown_storefront_app_route_unconfirmed'],
]) {
  test(`generic 503 fallback fails ${option} even with trusted certificates and healthy known tenants`, async () => {
    const result = await runSignupEdgeReadiness([], probes({ [option]: 503 }));
    assert.equal(result.ok, false);
    assert.ok(result.results.every(row => row.errors.includes(error)));
  });
}

test('valid environment-specific known-host overrides reach the real verifier', async () => {
  const injected = probes();
  const result = await runSignupEdgeReadiness(['--net-known-admin', 'other.admin.saas-staging.celebix.net', '--net-known-storefront', 'other.saas-staging.celebix.net'], injected);
  assert.equal(result.ok, true);
  assert.ok(injected.calls.some(row => row.hostname === 'other.admin.saas-staging.celebix.net'));
});

test('crossed, nested, URL/token and malformed flags reject before any probes', async () => {
  for (const args of [
    ['--net-known-admin', 'guzide.admin.saas-staging.celebix.site'],
    ['--site-known-storefront', 'guzide.saas-staging.celebix.net'],
    ['--net-known-storefront', 'nested.shop.saas-staging.celebix.net'],
    ['--net-known-admin', 'https://user:token@hizli-kutu.admin.saas-staging.celebix.net/auth/handoff'],
    ['--net-known-admin', 'Upper.admin.saas-staging.celebix.net'],
    ['--skip-site', 'true'], ['--net-known-admin'],
    ['--net-known-admin', 'a.admin.saas-staging.celebix.net', '--net-known-admin', 'b.admin.saas-staging.celebix.net'],
  ]) {
    const injected = probes();
    await assert.rejects(runSignupEdgeReadiness(args, injected), /signup_edge_arguments_invalid/u);
    assert.equal(injected.calls.length, 0);
  }
});

test('unresponsive probes fail with bounded timeout while other environment completes', async () => {
  const injected = probes();
  const result = await runSignupEdgeReadiness([], { ...injected, timeoutMs: 20,
    probeCertificate: (role, hostname) => hostname.endsWith('.net') ? new Promise(() => {}) : injected.probeCertificate(role, hostname) });
  assert.equal(result.ok, false);
  assert.deepEqual(result.results[0].errors, ['edge_probe_timeout']);
  assert.equal(result.results[1].ok, true);
});

test('CLI invalid input exits nonzero with safe JSON and no token echo', () => {
  const script = fileURLToPath(new URL('./verify-signup-edge.mjs', import.meta.url));
  const run = spawnSync(process.execPath, [script, '--token', 'private-token'], { encoding: 'utf8', timeout: 2_000 });
  assert.equal(run.status, 1);
  assert.equal(JSON.parse(run.stdout).ok, false);
  assert.equal((run.stdout + run.stderr).includes('private-token'), false);
});
