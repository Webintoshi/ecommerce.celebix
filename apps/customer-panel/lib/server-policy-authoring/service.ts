import 'server-only';
import { createHash } from 'node:crypto';
import { FIXED_STOREFRONT_POLICIES, isMerchantActionAllowed, type StorefrontPolicyKey, type TenantContext } from '@celebix/saas-contracts';
import { openMerchantProviderCredential, type MerchantProviderCredentialKeyring, type StorePolicyAdminRepository, type ToshiCreditRepository, type ToshiProviderRepository } from '@celebix/saas-data';
import { normalizeProductDescriptionHtml } from '@celebix/platform-config/src/product-description-rich-text.ts';
import { POLICY_AUTHORING_CREDIT_COST, type PolicyAuthoringRequest, type PolicyAuthoringResult } from '../policy-authoring/types.ts';
import { exactPolicyObject, parsePolicyAuthoringRequest, parsePolicyAuthoringResult, policyDigest, policySafeBody, policySuggestions, policyText, POLICY_AUTHORING_UUID } from '../policy-authoring/validation.ts';
import { ToshiGenerationError, type ToshiGenerationRegistry } from '../toshi-generation/types.ts';
import { POLICY_AUTHORING_BRIEFS, POLICY_AUTHORING_SYSTEM } from './prompt.ts';

export type PolicyMerchantFacts = Readonly<{ facts: readonly Readonly<{ ref: string; label: string; value: string }>[]; missing: readonly string[] }>;
const CODES = new Set(['invalid_input', 'source_too_large', 'unauthenticated', 'membership_denied', 'store_inactive', 'origin_denied', 'feature_not_enabled', 'credential_invalid', 'insufficient_credits', 'operation_busy', 'operation_mismatch', 'operation_failed', 'operation_not_found', 'commit_unknown', 'connection_missing', 'connection_revoked', 'model_unavailable', 'provider_unavailable', 'provider_timeout', 'quota_exceeded', 'invalid_output', 'rate_limited', 'cancelled', 'unavailable', 'version_conflict']);
export class PolicyAuthoringError extends Error { constructor(readonly code: string) { super('policy_authoring_failed'); this.code = CODES.has(code) ? code : 'unavailable'; } }
export function safePolicyAuthoringError(error: unknown): PolicyAuthoringError {
  if (error instanceof PolicyAuthoringError) return error;
  if (error instanceof ToshiGenerationError && error.outcome) return new PolicyAuthoringError('invalid_output');
  const descriptor = error && typeof error === 'object' ? Object.getOwnPropertyDescriptor(error, 'code') : null;
  return new PolicyAuthoringError(descriptor && 'value' in descriptor && typeof descriptor.value === 'string' ? descriptor.value : 'unavailable');
}
export type PolicyAuthoringGenerateInput = Readonly<{ tenantContext: TenantContext; operationId: string; request: PolicyAuthoringRequest; signal: AbortSignal; deadlineAt?: number }>;
type Dependencies = Readonly<{
  credits: ToshiCreditRepository; policies: Pick<StorePolicyAdminRepository, 'list'>;
  loadFacts(input: Readonly<{ tenantContext: TenantContext; now: Date; policyKey: StorefrontPolicyKey }>): Promise<PolicyMerchantFacts>;
  providers: Pick<ToshiProviderRepository, 'getAuthority'>; keyring(): MerchantProviderCredentialKeyring; generations: ToshiGenerationRegistry;
  now(): Date; timeoutMs?: number;
}>;
export function policyAuthoringFingerprint(storeId: string, request: PolicyAuthoringRequest): string {
  return createHash('sha256').update(JSON.stringify({ kind: 'toshi_policy_authoring_v1', storeId, request: parsePolicyAuthoringRequest(request) })).digest('hex');
}
function boundedFacts(value: PolicyMerchantFacts): PolicyMerchantFacts {
  const raw = exactPolicyObject(value, ['facts', 'missing']);
  if (!Array.isArray(raw.facts) || raw.facts.length > 32) throw new PolicyAuthoringError('unavailable');
  const facts = raw.facts.map(value => { const fact = exactPolicyObject(value, ['ref', 'label', 'value']); return Object.freeze({ ref: policyText(fact.ref, 100, true), label: policyText(fact.label, 120, true), value: policyText(fact.value, 1000, true) }); });
  if (new Set(facts.map(fact => fact.ref)).size !== facts.length || Buffer.byteLength(JSON.stringify(facts), 'utf8') > 8000) throw new PolicyAuthoringError('unavailable');
  return Object.freeze({ facts: Object.freeze(facts), missing: policySuggestions(raw.missing) });
}
function parseUsage(value: unknown) {
  if (value === undefined) return null;
  const raw = exactPolicyObject(value, ['inputTokens', 'outputTokens']);
  if (!Number.isSafeInteger(raw.inputTokens) || !Number.isSafeInteger(raw.outputTokens) || (raw.inputTokens as number) < 0 || (raw.outputTokens as number) < 0) throw new PolicyAuthoringError('invalid_output');
  const totalTokens = (raw.inputTokens as number) + (raw.outputTokens as number); if (totalTokens > 2147483647) throw new PolicyAuthoringError('invalid_output');
  return Object.freeze({ inputTokens: raw.inputTokens as number, outputTokens: raw.outputTokens as number, totalTokens });
}
function renderOutput(value: unknown, sourceFingerprint: string, facts: PolicyMerchantFacts): Readonly<{ body: string; suggestions: readonly string[] }> {
  const raw = exactPolicyObject(value, ['sourceFingerprint', 'bodyMarkdown', 'suggestions']);
  if (raw.sourceFingerprint !== sourceFingerprint) throw new PolicyAuthoringError('invalid_output');
  const markdown = policyText(raw.bodyMarkdown, 30_000, true);
  if (markdown.length > 11_000 || /[<>]|```|!?\[[^\]]*\]\s*\(|(?:https?:\/\/|www\.)/iu.test(markdown)) throw new PolicyAuthoringError('invalid_output');
  if ((markdown.match(/^##\s+\S/gmu) ?? []).length < 3 || (markdown.match(/[\p{L}\p{N}]+/gu) ?? []).length < 100) throw new PolicyAuthoringError('invalid_output');
  const source = facts.facts.map(fact => fact.value).join('\n');
  const numbers = (text: string) => text.match(/\d+(?:[.,]\d+)*/gu) ?? [];
  const allowedNumbers = new Set(numbers(source));
  if (numbers(markdown).some(number => !allowedNumbers.has(number))) throw new PolicyAuthoringError('invalid_output');
  const emails = markdown.match(/[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/gu) ?? [];
  if (emails.some(email => !source.includes(email)) || /(?:tamamen|tam|yüzde yüz|%\s*100)\s+(?:KVKK(?:'ya)?\s+)?uyumlu|hukuken\s+onayl[ıi]|mutlak\s+güvenli/iu.test(markdown)) throw new PolicyAuthoringError('invalid_output');
  return Object.freeze({ body: policySafeBody(normalizeProductDescriptionHtml(markdown)), suggestions: Object.freeze([...new Set([...facts.missing, ...policySuggestions(raw.suggestions)])].slice(0, 8)) });
}
const STORED_KEYS = ['schemaVersion', 'kind', 'operationId', 'draftId', 'policyKey', 'policyVersion', 'requestFingerprint', 'sourceFingerprint', 'body', 'suggestions', 'chargedCredits', 'provider', 'model', 'promptVersion', 'usage'] as const;
function replay(value: unknown, input: PolicyAuthoringGenerateInput, requestFingerprint: string, wallet: PolicyAuthoringResult['wallet']): PolicyAuthoringResult {
  try {
    const raw = exactPolicyObject(value, STORED_KEYS);
    if (raw.schemaVersion !== 1 || raw.provider !== 'deepseek' || raw.model !== 'deepseek-flash' || raw.promptVersion !== 'policy-authoring-v1' || raw.requestFingerprint !== requestFingerprint) throw Error();
    policyDigest(raw.sourceFingerprint);
    if (raw.usage !== null) { const usage = exactPolicyObject(raw.usage, ['inputTokens', 'outputTokens', 'totalTokens']); const measured = parseUsage({ inputTokens: usage.inputTokens, outputTokens: usage.outputTokens }); if (measured!.totalTokens !== usage.totalTokens) throw Error(); }
    return parsePolicyAuthoringResult({ kind: raw.kind, operationId: raw.operationId, draftId: raw.draftId, policyKey: raw.policyKey, policyVersion: raw.policyVersion, requestFingerprint: raw.requestFingerprint, body: raw.body, suggestions: raw.suggestions, chargedCredits: raw.chargedCredits, wallet }, input);
  } catch { throw new PolicyAuthoringError('unavailable'); }
}

export function createPolicyAuthoringService(deps: Dependencies) {
  return Object.freeze({ async generate(input: PolicyAuthoringGenerateInput): Promise<PolicyAuthoringResult> {
    let request: PolicyAuthoringRequest;
    try { request = parsePolicyAuthoringRequest(input.request); if (!POLICY_AUTHORING_UUID.test(input.operationId) || !(input.signal instanceof AbortSignal)) throw Error(); } catch { throw new PolicyAuthoringError('invalid_input'); }
    if (input.tenantContext.store.status !== 'active') throw new PolicyAuthoringError('store_inactive');
    if (input.tenantContext.membership.status !== 'active' || !isMerchantActionAllowed(input.tenantContext.membership.role, 'content.manage')) throw new PolicyAuthoringError('membership_denied');
    const fingerprint = policyAuthoringFingerprint(input.tenantContext.store.id, request), controller = new AbortController(), signal = AbortSignal.any([input.signal, controller.signal]);
    const milliseconds = Math.min(45_000, deps.timeoutMs ?? 45_000, input.deadlineAt === undefined ? 45_000 : input.deadlineAt - performance.now());
    if (!Number.isFinite(milliseconds) || milliseconds <= 0) throw new PolicyAuthoringError('provider_timeout');
    const deadline = performance.now() + milliseconds;
    const expired = () => new PolicyAuthoringError(input.signal.aborted ? 'cancelled' : 'provider_timeout');
    let rejectAbort: (error: unknown) => void = () => {};
    const aborted = new Promise<never>((_, reject) => { rejectAbort = reject; }); void aborted.catch(() => {});
    const onAbort = () => rejectAbort(expired()); signal.addEventListener('abort', onAbort, { once: true });
    const timer = setTimeout(() => controller.abort(), Math.max(1, milliseconds - Math.min(5000, Math.ceil(milliseconds / 3))));
    const active = () => { if (signal.aborted || performance.now() >= deadline) throw expired(); };
    const run = async <T>(operation: () => Promise<T>): Promise<T> => { active(); const value = await Promise.race([operation(), aborted]); active(); return value; };
    const terminal = async <T>(operation: () => Promise<T>): Promise<T> => {
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try { return await Promise.race([operation(), new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new PolicyAuthoringError('provider_timeout')), Math.max(1, deadline - performance.now())); })]); }
      finally { if (timeout) clearTimeout(timeout); }
    };
    const base = () => ({ tenantContext: input.tenantContext, now: deps.now(), operationId: input.operationId, fingerprint });
    let reserved = false, dispatched = false, completing = false, secret: Uint8Array | undefined, keyring: MerchantProviderCredentialKeyring | undefined;
    try {
      const reservation = await run(() => deps.credits.reserve({ ...base(), cost: POLICY_AUTHORING_CREDIT_COST }));
      if (reservation.kind === 'pending') throw new PolicyAuthoringError('operation_busy');
      if (reservation.kind === 'replayed') {
        if (reservation.status !== 'completed') throw new PolicyAuthoringError('operation_failed');
        if (reservation.chargedCredits !== POLICY_AUTHORING_CREDIT_COST) throw new PolicyAuthoringError('unavailable');
        return replay(reservation.result, input, fingerprint, await run(() => deps.credits.getWallet({ tenantContext: input.tenantContext, now: deps.now() })));
      }
      reserved = true;
      const pages = await run(() => deps.policies.list({ tenantContext: input.tenantContext, now: deps.now() }));
      const page = pages.find(page => page.key === request.policyKey);
      if (!page || page.version !== request.policyVersion) throw new PolicyAuthoringError('version_conflict');
      const facts = boundedFacts(await run(() => deps.loadFacts({ tenantContext: input.tenantContext, now: deps.now(), policyKey: request.policyKey })));
      const definition = FIXED_STOREFRONT_POLICIES.find(policy => policy.key === request.policyKey)!;
      const packet = { target: { kind: 'policy', draftId: request.draftId, policyKey: request.policyKey, policyVersion: page.version }, policy: { key: definition.key, label: definition.label, brief: POLICY_AUTHORING_BRIEFS[definition.key] }, locale: request.locale, facts: facts.facts, missingFacts: facts.missing, currentBody: request.currentBody };
      const sourceFingerprint = createHash('sha256').update(JSON.stringify(packet)).digest('hex');
      const data = JSON.stringify({ ...packet, sourceFingerprint });
      if (Buffer.byteLength(data, 'utf8') > 32_768) throw new PolicyAuthoringError('source_too_large');
      const authority = await run(() => deps.providers.getAuthority({ tenantContext: input.tenantContext, now: deps.now(), provider: 'deepseek' }));
      if (authority.provider !== 'deepseek' || authority.selectedModel !== 'deepseek-flash') throw new PolicyAuthoringError('model_unavailable');
      keyring = deps.keyring(); secret = openMerchantProviderCredential({ envelope: authority.sealedCredentials, profileId: authority.configId, storeId: input.tenantContext.store.id, providerCode: 'deepseek', capability: 'ai_assistant', credentialVersion: authority.credentialVersion, keyring });
      keyring.keys.forEach(key => key.key.fill(0));
      const recheck = async () => { const current = await run(() => deps.providers.getAuthority({ tenantContext: input.tenantContext, now: deps.now(), provider: 'deepseek' })); if (current.configId !== authority.configId || current.credentialVersion !== authority.credentialVersion || current.version !== authority.version || current.selectedModel !== authority.selectedModel) throw new PolicyAuthoringError('connection_revoked'); };
      await recheck();
      const latest = await run(() => deps.policies.list({ tenantContext: input.tenantContext, now: deps.now() }));
      if (latest.find(page => page.key === request.policyKey)?.version !== request.policyVersion) throw new PolicyAuthoringError('version_conflict');
      active(); dispatched = true;
      const output = await run(() => deps.generations.get('deepseek').generate({ authoringProfile: 'product_quality', outputFormat: 'json_object', maxOutputTokens: 12288, model: authority.selectedModel, secret: secret!, system: POLICY_AUTHORING_SYSTEM, history: [{ role: 'user', text: data }], tools: [], signal }));
      let rendered: ReturnType<typeof renderOutput>, usage: ReturnType<typeof parseUsage>;
      try {
        if (output.toolCalls.length || !output.text.trim() || output.text.length > 12_000 || Buffer.byteLength(output.text, 'utf8') > 32_768 || output.text.includes(new TextDecoder().decode(secret))) throw Error();
        const parsed = JSON.parse(output.text);
        if (JSON.stringify(parsed).includes(new TextDecoder().decode(secret))) throw Error();
        rendered = renderOutput(parsed, sourceFingerprint, facts); usage = parseUsage(output.usage);
      } catch { throw new PolicyAuthoringError('invalid_output'); }
      await recheck(); active();
      const durable = Object.freeze({ schemaVersion: 1, kind: 'policy', operationId: input.operationId, draftId: request.draftId, policyKey: request.policyKey, policyVersion: request.policyVersion, requestFingerprint: fingerprint, sourceFingerprint, ...rendered, chargedCredits: POLICY_AUTHORING_CREDIT_COST, provider: 'deepseek', model: 'deepseek-flash', promptVersion: 'policy-authoring-v1', usage });
      completing = true;
      const wallet = await terminal(() => deps.credits.complete({ ...base(), result: durable, chargedCredits: POLICY_AUTHORING_CREDIT_COST }));
      reserved = false;
      return replay(durable, input, fingerprint, wallet);
    } catch (error) {
      const failure = safePolicyAuthoringError(error);
      const safe = completing && failure.code === 'provider_timeout' ? new PolicyAuthoringError('commit_unknown') : failure;
      if (reserved && !completing) { try { await terminal(() => deps.credits.fail({ ...base(), safeCode: safe.code, unknown: dispatched && ['provider_timeout', 'provider_unavailable', 'cancelled'].includes(safe.code) })); } catch { /* The finite wallet reservation remains the recovery fence. */ } }
      throw safe;
    } finally { clearTimeout(timer); signal.removeEventListener('abort', onAbort); secret?.fill(0); keyring?.keys.forEach(key => key.key.fill(0)); }
  } });
}
export type PolicyAuthoringService = ReturnType<typeof createPolicyAuthoringService>;
