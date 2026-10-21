import { pathToFileURL } from 'node:url';
import { runTenantWildcardReadiness } from './verify-tenant-wildcard-readiness.mjs';

const TIMEOUT_MS = 15_000;
const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u;
const TARGETS = Object.freeze([
  Object.freeze({ environment: 'staging_net', flag: 'net', suffix: 'saas-staging.celebix.net', tenant: 'hizli-kutu' }),
  // Existing SITE fixture documented in operations/tenant-admin-auth-rollout.md.
  Object.freeze({ environment: 'staging', flag: 'site', suffix: 'saas-staging.celebix.site', tenant: 'guzide-kuyumcu-4' }),
]);
const LIMITATIONS = Object.freeze([
  'Samples the existing verifier DNS/TLS connection per hostname; does not certify every A/AAAA address or proxy backend.',
  'Read-only edge readiness; does not create a tenant, consume handoff tokens, or prove authenticated session completion.',
]);

function argumentsFrom(argv) {
  if (!Array.isArray(argv) || argv.length % 2 !== 0) throw new Error('signup_edge_arguments_invalid');
  const allowed = new Set(TARGETS.flatMap(target => [`--${target.flag}-known-admin`, `--${target.flag}-known-storefront`]));
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index], value = argv[index + 1];
    if (!allowed.has(flag) || typeof value !== 'string' || values.has(flag)) throw new Error('signup_edge_arguments_invalid');
    values.set(flag, value);
  }
  return TARGETS.map(target => {
    const hosts = {};
    for (const role of ['admin', 'storefront']) {
      const suffix = `.${role === 'admin' ? 'admin.' : ''}${target.suffix}`;
      const hostname = values.get(`--${target.flag}-known-${role}`) ?? `${target.tenant}${suffix}`;
      if (hostname.length > 253 || !hostname.endsWith(suffix) || !LABEL.test(hostname.slice(0, -suffix.length))) {
        throw new Error('signup_edge_arguments_invalid');
      }
      hosts[role] = hostname;
    }
    return { ...target, ...hosts };
  });
}

async function verifyTarget(target, dependencies, timeoutMs) {
  let timer;
  const failed = code => ({ ok: false, environment: target.environment, errors: [code], warnings: [] });
  try {
    const result = await Promise.race([
      runTenantWildcardReadiness(['--environment', target.environment, '--known-admin', target.admin,
        '--known-storefront', target.storefront], dependencies),
      new Promise(resolve => { timer = setTimeout(() => resolve(failed('edge_probe_timeout')), timeoutMs); }),
    ]);
    if (result.ok !== true) return result;
    // Legacy readiness also permits 503. Require an application 404 here so a
    // generic proxy fallback cannot stand in for a working wildcard tenant route.
    const errors = [];
    if (result.probes?.http?.unknownAdmin?.status !== 404) errors.push('unknown_admin_app_route_unconfirmed');
    if (result.probes?.http?.unknownStorefront?.status !== 404) errors.push('unknown_storefront_app_route_unconfirmed');
    return errors.length === 0 ? result : { ...result, ok: false, errors: [...result.errors, ...errors] };
  } catch {
    return failed('edge_probe_failed');
  } finally {
    clearTimeout(timer);
  }
}

/** No credentials or token arguments. Inject only external probes for offline tests. */
export async function runSignupEdgeReadiness(argv = [], dependencies = {}) {
  const targets = argumentsFrom(argv);
  const timeoutMs = dependencies.timeoutMs ?? TIMEOUT_MS;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > TIMEOUT_MS) throw new Error('signup_edge_timeout_invalid');
  const results = await Promise.all(targets.map(target => verifyTarget(target, dependencies, timeoutMs)));
  return Object.freeze({ schemaVersion: 1, ok: results.every(result => result.ok === true),
    checkedAt: new Date().toISOString(), results: Object.freeze(results), limitations: LIMITATIONS });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // The existing verifier cannot cancel DNS resolution. Exit after the bounded result
  // is flushed so an outstanding resolver cannot leave the operational CLI hanging.
  runSignupEdgeReadiness(process.argv.slice(2)).catch(() => ({ schemaVersion: 1, ok: false,
    errors: ['signup_edge_arguments_invalid'] })).then(result => {
    process.stdout.write(`${JSON.stringify(result)}\n`, () => process.exit(result.ok === true ? 0 : 1));
  });
}
