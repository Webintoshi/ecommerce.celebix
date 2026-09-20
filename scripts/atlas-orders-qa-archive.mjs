import { pathToFileURL } from 'node:url';

// Server-side maintenance entrypoint, not an authentication mechanism. The host
// must resolve a fresh authenticated TenantContext and database identity using
// its existing trusted runtime. Never deserialize authority from CLI arguments.
const DATABASE = 'celebix_saas_staging_auth01';
const STORE = 'a828862c-4cc1-475a-89cc-5fbee31eb43f';
const SLUG = 'guzide-kuyumcu-4';
const TARGETS = Object.freeze([
  Object.freeze({ id: 'af1982e0-c3f2-5f39-8509-8e0250394b13', operationId: 'd1df445a-c2d7-4780-aa3e-e6eb26997b29', orderNumber: 'MAN-af1982e0c3f25f398509', createdAt: '2026-08-01T15:36:36.656Z' }),
  Object.freeze({ id: '0e8bca85-e87c-5a82-8a4e-d615b6d4df29', operationId: 'd9b2a7c0-cbe7-4de3-a697-53d24c6a8c75', orderNumber: 'MAN-0e8bca85e87c5a828a4e', createdAt: '2026-08-01T15:37:26.880Z' }),
]);
const REASON = 'Explicitly reviewed obsolete QA order; reversible operational archive only.';

function fail(code) { throw new Error(`orders_qa_archive_${code}`); }

export async function runOrdersQaArchive(options) {
  if (!options || typeof options !== 'object' || Array.isArray(options) ||
      Object.keys(options).some(key => !['resolveAuthorizedScope', 'mode', 'evidenceReference'].includes(key))) fail('invalid_options');
  const mode = options.mode ?? 'dry-run';
  if (!['dry-run', 'apply'].includes(mode)) fail('invalid_options');
  if (typeof options.resolveAuthorizedScope !== 'function') fail('authorized_scope_required');
  const evidenceReference = options.evidenceReference;
  if (mode === 'apply' && (typeof evidenceReference !== 'string' || evidenceReference.length < 1 ||
      evidenceReference.length > 500 || evidenceReference !== evidenceReference.trim() || /[\u0000-\u001f\u007f]/.test(evidenceReference))) fail('evidence_required');
  const results = [];
  let archivedCount = 0;
  for (const target of TARGETS) {
    // Refresh authority for each target; the repository separately enforces
    // permissions and rechecks dependencies inside the mutation transaction.
    const scope = await options.resolveAuthorizedScope();
    if (!scope?.tenantContext || !scope.orders) fail('authorized_scope_required');
    if (scope.databaseName !== DATABASE || scope.storeSlug !== SLUG || scope.tenantContext.store?.id !== STORE) fail('scope_mismatch');
    const now = new Date();
    const input = { tenantContext: scope.tenantContext, now, orderId: target.id };
    const detail = await scope.orders.getOrder(input);
    // These markers are secondary evidence checks on the exact allowlist, never
    // a search predicate or authorization to select additional QA-like records.
    if (detail?.id !== target.id || detail.orderNumber !== target.orderNumber ||
        detail.createdAt !== target.createdAt || detail.source !== 'manual' || detail.totalCents !== 9094500 ||
        typeof detail.customerName !== 'string' || !/(test|qa|atlas|mira|deneme|örnek|ornek)/i.test(detail.customerName) ||
        typeof detail.customerEmail !== 'string' || !/(^|@)(example|test)|[.]test$|@(invalid|localhost)$/i.test(detail.customerEmail)) fail('target_evidence_changed');
    const eligibility = await scope.orders.getArchiveEligibility(input);
    if (eligibility?.id !== target.id || typeof eligibility.eligible !== 'boolean' ||
        typeof eligibility.archived !== 'boolean' || !Array.isArray(eligibility.blockers) ||
        eligibility.blockers.some(code => typeof code !== 'string' || !/^[a-z][a-z0-9_]{0,79}$/.test(code))) fail('invalid_eligibility');
    const report = { orderId: target.id, eligible: eligibility.eligible, archived: eligibility.archived, blockers: [...eligibility.blockers], action: 'none' };
    if (mode === 'apply' && eligibility.archived) report.action = 'already_archived';
    if (mode === 'apply' && eligibility.eligible && !eligibility.archived) {
      const result = await scope.orders.archiveOrder({ ...input, operationId: target.operationId, reason: REASON, evidenceReference });
      if (result?.id !== target.id || result.operationId !== target.operationId || result.archived !== true || typeof result.replayed !== 'boolean') fail('invalid_result');
      // Replayed outcomes describe the original operation, not necessarily
      // present state after a later restore. Never report historical success
      // as current archive state without a fresh authorized read.
      const current = await scope.orders.getArchiveEligibility({ ...input, now: new Date() });
      if (current?.id !== target.id || current.archived !== true) fail('archive_state_not_confirmed');
      report.action = result.replayed ? 'replayed' : 'archived';
      report.archived = true;
      if (!result.replayed) archivedCount += 1;
    }
    results.push(report);
  }
  return { mode, storeId: STORE, archivedCount, deletedCount: 0, results };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // Intentionally no credential/module/DB URL flags and no autonomous apply.
  // Import runOrdersQaArchive only from an already-authorized server host.
  console.error('BLOCKED: authorized server runtime required; no database read or mutation performed.');
  process.exitCode = 2;
}
