import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { AdminLoginInvalidationInput, AdminLoginSecurityResult } from '../../../../packages/saas-contracts/src/admin-login-security/types.ts';

export type AdminLoginInvalidationWebhookOptions = Readonly<{
  issuer: string;
  signingSecret: Uint8Array | string;
  clock(): Date;
  invalidate(input: AdminLoginInvalidationInput): Promise<AdminLoginSecurityResult>;
}>;

const MAX_BODY_BYTES = 65_536;
const MAX_PAST_AGE_MS = 7 * 24 * 60 * 60 * 1_000;
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1_000;
const REASONS: Readonly<Record<string, AdminLoginInvalidationInput['reason']>> = Object.freeze({
  PostResetPassword: 'password_reset',
  // Logto emits a current user snapshot without previous values or a change
  // mask. Password/phone/email and ordinary profile edits share this event;
  // conservative revocation avoids missing credential or identity changes.
  'User.Data.Updated': 'identity_reset',
  'User.SuspensionStatus.Updated': 'suspension',
  'User.Deleted': 'deletion',
});

class InvalidRequest extends Error {
  constructor(readonly status: 400 | 401 | 413) { super('admin_login_webhook_invalid'); }
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new InvalidRequest(400);
  return value as Record<string, unknown>;
}
function identifier(value: unknown, maximum = 512): string {
  if (typeof value !== 'string' || !value || value.length > maximum || /\s|[\u0000-\u001f\u007f-\u009f]/u.test(value)) throw new InvalidRequest(400);
  return value;
}
function response(status: 200 | 400 | 401 | 405 | 413 | 503): Response {
  return new Response(null, { status, headers: { 'cache-control': 'no-store', ...(status === 405 ? { allow: 'POST' } : {}) } });
}
async function rawBody(request: Request): Promise<Buffer> {
  const length = request.headers.get('content-length');
  if (length !== null) {
    if (!/^\d+$/u.test(length)) throw new InvalidRequest(400);
    if (Number(length) > MAX_BODY_BYTES) throw new InvalidRequest(413);
  }
  if (!request.body) return Buffer.alloc(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
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
    return Buffer.concat(chunks, size);
  } finally { reader.releaseLock(); }
}
function subjectFor(event: Record<string, unknown>): string {
  const params = event.params === undefined ? undefined : record(event.params);
  const user = event.user === undefined ? undefined : record(event.user);
  const data = event.data == null ? undefined : record(event.data);
  const subject = identifier(event.event === 'PostResetPassword' ? event.userId : data?.id ?? (event.event === 'User.Deleted' ? params?.userId : undefined));
  // Context may contain several references to the same affected user. Never choose
  // between contradictory references or use an arbitrary entity's nested ID.
  for (const reference of [event.userId, user?.id, data?.id, params?.userId]) {
    if (reference !== undefined && identifier(reference) !== subject) throw new InvalidRequest(400);
  }
  if (event.event === 'PostResetPassword' && event.interactionEvent !== 'ForgotPassword') throw new InvalidRequest(400);
  if (event.path !== undefined) {
    const path = identifier(event.path, 2048);
    const match = /^\/users\/([^/?#]+)(?:\/[^?#]*)?$/u.exec(path);
    if (!match || decodeURIComponent(match[1]) !== subject) throw new InvalidRequest(400);
  }
  return subject;
}

/**
 * Logto delivers lowercase hex SHA-256 HMAC of the exact JSON body in
 * logto-signature-sha-256. The installed sender emits no event/log ID or issuer;
 * the exclusive webhook secret binds configured issuer and signed delivery bytes
 * form the stable native deduplication key. No identity field acts as an event ID.
 * https://docs.logto.io/developers/webhooks/secure-webhooks
 */
export function createAdminLoginInvalidationWebhookHandler(options: AdminLoginInvalidationWebhookOptions): (request: Request) => Promise<Response> {
  let issuer: string;
  let secret: Buffer;
  try {
    issuer = identifier(options.issuer, 2048);
    const url = new URL(issuer);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw Error();
    secret = typeof options.signingSecret === 'string' ? Buffer.from(options.signingSecret, 'utf8') : Buffer.from(options.signingSecret);
    if (secret.byteLength < 32 || secret.byteLength > 4096) throw Error();
  } catch { throw new Error('admin_login_webhook_configuration_invalid'); }
  return async (request) => {
    if (request.method !== 'POST') return response(405);
    if (!/^application\/json(?:\s*;\s*charset\s*=\s*utf-8)?$/iu.test(request.headers.get('content-type') ?? '')) return response(400);
    let body: Buffer;
    let event: Record<string, unknown>;
    let subject: string;
    let reason: AdminLoginInvalidationInput['reason'];
    try {
      body = await rawBody(request);
      const signature = request.headers.get('logto-signature-sha-256');
      if (!signature || !/^[a-f0-9]{64}$/u.test(signature) || !timingSafeEqual(createHmac('sha256', secret).update(body).digest(), Buffer.from(signature, 'hex'))) throw new InvalidRequest(401);
      event = record(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body)));
      identifier(event.hookId);
      const eventName = identifier(event.event);
      if (event.issuer !== undefined && event.issuer !== issuer) throw new InvalidRequest(401);
      if (typeof event.createdAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/u.test(event.createdAt) || !Number.isFinite(Date.parse(event.createdAt))) throw new InvalidRequest(400);
      if (new Date(event.createdAt).toISOString().slice(0, 19) !== event.createdAt.slice(0, 19)) throw new InvalidRequest(400);
      let receivedAt: Date;
      try { receivedAt = options.clock(); } catch { return response(503); }
      if (!(receivedAt instanceof Date) || !Number.isFinite(receivedAt.getTime())) return response(503);
      // Deliveries retain their original signed timestamp across provider retries.
      // Allow outages while native exact-body dedupe prevents repeat invalidation;
      // an out-of-order unseen event conservatively revokes current assurance.
      const age = receivedAt.getTime() - Date.parse(event.createdAt);
      if (age > MAX_PAST_AGE_MS || age < -MAX_FUTURE_SKEW_MS) throw new InvalidRequest(401);
      if (!Object.hasOwn(REASONS, eventName)) return response(200);
      reason = REASONS[eventName];
      subject = subjectFor(event);
    } catch (error) { return response(error instanceof InvalidRequest ? error.status : 400); }
    try {
      const result = await options.invalidate({ issuer, subject, eventId: `logto:${createHash('sha256').update(body).digest('hex')}`, reason });
      if (['invalidated', 'operation_replayed', 'not_found'].includes(result.outcome)) return response(200);
      if (['operation_mismatch', 'invalid_input'].includes(result.outcome)) return response(400);
      return response(503);
    } catch { return response(503); }
  };
}
