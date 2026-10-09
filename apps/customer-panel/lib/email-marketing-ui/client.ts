import {
  emailMarketingObject, emailMarketingText, emailMarketingUuid,
  parseEmailMarketingAudiencePreview, parseEmailMarketingConnection,
  parseEmailMarketingList, parseEmailMarketingOverview, parseEmailMarketingProvider,
  type EmailMarketingSelection,
} from '@celebix/saas-contracts';

export type EmailMarketingCandidate = Readonly<{
  candidateId: string; provider: 'brevo' | 'klaviyo'; accountId: string;
  accountName: string; expiresAt: string;
}>;
export type EmailMarketingApply = Readonly<{
  operationId: string; candidateId: string; expectedVersion: number; selection: EmailMarketingSelection;
}>;
export type EmailMarketingVersionOperation = Readonly<{operationId: string; expectedVersion: number}>;
const ROOT = '/api/marketing/email-connections';
const SAFE_CODES = new Set([
  'invalid_input', 'unauthorized', 'forbidden', 'version_conflict', 'operation_conflict',
  'candidate_expired', 'account_in_use', 'account_mismatch', 'provider_unauthorized',
  'provider_forbidden', 'provider_rate_limited', 'provider_unavailable',
  'provider_invalid_response', 'outcome_unknown', 'cleanup_pending', 'not_configured',
]);
export class EmailMarketingUiError extends Error {
  constructor(readonly code: string) { super(code); this.name = 'EmailMarketingUiError'; }
}
function candidate(value: unknown): EmailMarketingCandidate {
  const v = emailMarketingObject(value, ['candidateId', 'provider', 'accountId', 'accountName', 'expiresAt']);
  const expiresAt = emailMarketingText(v.expiresAt, 80);
  if (!Number.isFinite(Date.parse(expiresAt))) throw TypeError('invalid');
  return Object.freeze({candidateId: emailMarketingUuid(v.candidateId), provider: parseEmailMarketingProvider(v.provider),
    accountId: emailMarketingText(v.accountId), accountName: emailMarketingText(v.accountName), expiresAt});
}
function lists(value: unknown) {
  const v = emailMarketingObject(value, ['items'], ['nextCursor']);
  if (!Array.isArray(v.items) || v.items.length > 100) throw TypeError('invalid');
  return {items: v.items.map(parseEmailMarketingList), ...(v.nextCursor == null ? {} : {nextCursor: emailMarketingText(v.nextCursor, 2048)})};
}

export function createEmailMarketingApi(fetcher: typeof fetch = fetch) {
  async function request<T>(path: string, parse: (value: unknown) => T, body?: Record<string, unknown>, operationId?: string): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);
    try {
      let response: Response;
      try {
        response = await fetcher(`${ROOT}${path}`, {
          method: body ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store', redirect: 'error',
          signal: controller.signal,
          headers: body ? {'content-type': 'application/json', 'idempotency-key': emailMarketingUuid(operationId)} : {},
          ...(body ? {body: JSON.stringify(body)} : {}),
        });
      } catch { throw new EmailMarketingUiError(body ? 'outcome_unknown' : 'provider_unavailable'); }
      let value: unknown;
      try { value = await response.json(); }
      catch { throw new EmailMarketingUiError(body && response.ok ? 'outcome_unknown' : 'provider_invalid_response'); }
      if (!response.ok) {
        const code = value && typeof value === 'object' && 'code' in value && typeof value.code === 'string' && SAFE_CODES.has(value.code) ? value.code : 'provider_unavailable';
        throw new EmailMarketingUiError(code);
      }
      try { return parse(value); }
      catch { throw new EmailMarketingUiError(body ? 'outcome_unknown' : 'provider_invalid_response'); }
    } finally { clearTimeout(timeout); }
  }
  return Object.freeze({
    overview: () => request('', parseEmailMarketingOverview),
    validate: ({operationId, ...body}: Readonly<{operationId: string; provider: 'brevo' | 'klaviyo'; apiKey: string; connectionId?: string}>) => request('/validate', candidate, body, operationId),
    lists: (candidateId: string, cursor?: string) => request(`/lists?${new URLSearchParams({candidateId, ...(cursor ? {cursor} : {})})}`, lists),
    preview: (candidateId: string, listId?: string) => request(`/preview?${new URLSearchParams({candidateId, ...(listId ? {listId} : {})})}`, parseEmailMarketingAudiencePreview),
    apply: ({operationId, ...body}: EmailMarketingApply) => request('/apply', parseEmailMarketingConnection, body, operationId),
    rotate: ({operationId, ...body}: Readonly<{operationId: string; candidateId: string; expectedVersion: number}>) => request('/rotate', parseEmailMarketingConnection, body, operationId),
    recheck: ({operationId, ...body}: EmailMarketingVersionOperation) => request('/recheck', parseEmailMarketingConnection, body, operationId),
    disconnect: ({operationId, ...body}: EmailMarketingVersionOperation) => request('/disconnect', parseEmailMarketingConnection, body, operationId),
    sync: ({operationId, ...body}: EmailMarketingVersionOperation) => request('/sync', parseEmailMarketingConnection, body, operationId),
  });
}
export type EmailMarketingApi = ReturnType<typeof createEmailMarketingApi>;
