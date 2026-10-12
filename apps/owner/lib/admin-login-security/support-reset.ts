import type { AdminLoginInvalidationInput, AdminLoginSecurityResult } from '../../../../packages/saas-contracts/src/admin-login-security/types.ts';

export type AdminLoginSupportResetOptions = Readonly<{
  issuer: string;
  allowedOrigin: string;
  requireOperator(request: Request): Promise<Readonly<{ operatorId: string; totpVerified: true }>>;
  invalidate(input: AdminLoginInvalidationInput): Promise<AdminLoginSecurityResult>;
}>;

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
const MAX_BODY_BYTES = 4096;
class InvalidRequest extends Error {
  constructor(readonly status: 400 | 413) { super('admin_login_support_reset_invalid'); }
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new InvalidRequest(400);
  return value as Record<string, unknown>;
}
function response(status: 200 | 400 | 401 | 403 | 404 | 405 | 409 | 413 | 503): Response {
  return new Response(null, { status, headers: { 'cache-control': 'no-store', ...(status === 405 ? { allow: 'POST' } : {}) } });
}
async function payload(request: Request): Promise<Readonly<{ subject: string; reason: string }>> {
  const length = request.headers.get('content-length');
  if (length !== null) {
    if (!/^\d+$/u.test(length)) throw new InvalidRequest(400);
    if (Number(length) > MAX_BODY_BYTES) throw new InvalidRequest(413);
  }
  if (!request.body) throw new InvalidRequest(400);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let bytes: Buffer;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > MAX_BODY_BYTES) {
        void reader.cancel().catch(() => undefined);
        throw new InvalidRequest(413);
      }
      chunks.push(next.value);
    }
    bytes = Buffer.concat(chunks, size);
  } finally { reader.releaseLock(); }
  const row = record(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
  if (Object.keys(row).length !== 2 || !Object.hasOwn(row, 'subject') || !Object.hasOwn(row, 'reason') ||
      typeof row.subject !== 'string' || row.subject.length < 1 || row.subject.length > 512 || /\s|[\u0000-\u001f\u007f-\u009f]/u.test(row.subject) ||
      typeof row.reason !== 'string' || /[\u0000-\u001f\u007f-\u009f]/u.test(row.reason)) throw new InvalidRequest(400);
  const reason = row.reason.trim();
  if (reason.length < 20 || reason.length > 500) throw new InvalidRequest(400);
  return Object.freeze({ subject: row.subject, reason });
}

/** requireOperator must project the existing platform TOTP authority, never
 * merchant WhatsApp assurance or caller-supplied operator/TOTP fields. */
export function createAdminLoginSupportResetHandler(options: AdminLoginSupportResetOptions): (request: Request) => Promise<Response> {
  let issuer: string;
  let allowedOrigin: string;
  try {
    issuer = options.issuer;
    if (typeof issuer !== 'string' || !issuer || issuer.length > 2048 || /\s|[\u0000-\u001f\u007f-\u009f]/u.test(issuer)) throw Error();
    const issuerUrl = new URL(issuer), originUrl = new URL(options.allowedOrigin);
    if (issuerUrl.protocol !== 'https:' || issuerUrl.username || issuerUrl.password || issuerUrl.search || issuerUrl.hash ||
        originUrl.protocol !== 'https:' || originUrl.origin !== options.allowedOrigin || typeof options.requireOperator !== 'function' || typeof options.invalidate !== 'function') throw Error();
    allowedOrigin = options.allowedOrigin;
  } catch { throw new Error('admin_login_support_reset_configuration_invalid'); }
  return async request => {
    if (request.method !== 'POST') return response(405);
    const requestUrl=new URL(request.url),host=request.headers.get('host');
    if(request.headers.get('origin')!==allowedOrigin||(requestUrl.protocol==='https:'&&requestUrl.origin!==allowedOrigin)||(requestUrl.protocol!=='https:'&&requestUrl.protocol!=='http:')||(host!==null&&host!==new URL(allowedOrigin).host))return response(403);
    let operatorId: string;
    try {
      const operator = record(await options.requireOperator(request));
      if (operator.totpVerified !== true || typeof operator.operatorId !== 'string' || !UUID.test(operator.operatorId)) return response(401);
      operatorId = operator.operatorId.toLowerCase();
    } catch { return response(401); }
    const key = request.headers.get('idempotency-key');
    if (!key || !UUID.test(key) || !/^application\/json(?:\s*;\s*charset\s*=\s*utf-8)?$/iu.test(request.headers.get('content-type') ?? '')) return response(400);
    let input: Readonly<{ subject: string; reason: string }>;
    try { input = await payload(request); }
    catch (error) { return response(error instanceof InvalidRequest ? error.status : 400); }
    try {
      const result = await options.invalidate({ issuer, subject: input.subject, eventId: `support:${key.toLowerCase()}`, reason: 'support_reset', operatorId, supportReason: input.reason });
      if (['invalidated', 'operation_replayed'].includes(result.outcome)) return response(200);
      if (result.outcome === 'operation_mismatch') return response(409);
      if (result.outcome === 'not_found') return response(404);
      if (result.outcome === 'invalid_input') return response(400);
      return response(503);
    } catch { return response(503); }
  };
}
