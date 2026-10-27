import { parseToshiCreditWallet, type ToshiCreditWallet } from '@celebix/saas-contracts';
import { acquirePostgresClient, type PostgresClientLike } from '../postgres/pool.ts';
import { exactToshiInput, toshiAuthority, toshiUuid } from '../toshi-providers/canonical.ts';
import { ToshiProviderRepositoryError } from '../toshi-providers/errors.ts';
import { TOSHI_CREDIT_ERROR_CODES, ToshiCreditRepositoryError, type ToshiCreditErrorCode } from './errors.ts';
import type { ToshiCreditAuthorityInput, ReserveToshiCreditsInput, ReserveToshiCreditsResult, CompleteToshiCreditsInput, FailToshiCreditsInput, ToshiCreditRepository, PostgresToshiCreditRepositoryOptions } from './types.ts';
const CODES = new Set<string>(TOSHI_CREDIT_ERROR_CODES);
const FINGERPRINT = /^[a-f0-9]{64}$/;
const SAFE_CODE = /^[a-z][a-z0-9_]{0,63}$/;
const MAX_RESULT_BYTES = 262_144;
function fail(code: ToshiCreditErrorCode = 'unavailable'): never { throw new ToshiCreditRepositoryError(code); }
function boundedInteger(value: unknown, minimum: number, maximum = 1000): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) fail('invalid_input');
  return value as number;
}
function fingerprint(value: unknown): string { if (typeof value !== 'string' || !FINGERPRINT.test(value)) fail('invalid_input'); return value; }
function timeout(value: number): string { if (!Number.isSafeInteger(value) || value < 1 || value > 60_000) fail('invalid_input'); return `${value}ms`; }
function input<T>(fn: () => T): T {
  try { return fn(); } catch (error) {
    if (error instanceof ToshiCreditRepositoryError) throw error;
    if (error instanceof ToshiProviderRepositoryError && CODES.has(error.code)) fail(error.code as ToshiCreditErrorCode);
    fail('invalid_input');
  }
}
// Only inert JSON can become a durable result. Accessors and toJSON hooks never execute.
function resultJson(value: unknown): unknown {
  const seen = new Set<object>();
  function visit(selected: unknown, depth: number): unknown {
    if (depth > 32) fail('invalid_input');
    if (selected === null || typeof selected === 'boolean' || typeof selected === 'string') return selected;
    if (typeof selected === 'number' && Number.isFinite(selected)) return selected;
    if (typeof selected !== 'object' || selected === null || seen.has(selected)) fail('invalid_input');
    seen.add(selected);
    try {
      const array = Array.isArray(selected), prototype = Object.getPrototypeOf(selected);
      if (array ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) fail('invalid_input');
      const descriptors = Object.getOwnPropertyDescriptors(selected);
      const keys = Reflect.ownKeys(descriptors);
      if (keys.length > MAX_RESULT_BYTES || keys.some(key => typeof key !== 'string')) fail('invalid_input');
      const entries = keys.filter(key => !(array && key === 'length')) as string[];
      if (array && (entries.length !== selected.length || entries.some((key, index) => key !== String(index)))) fail('invalid_input');
      const output: unknown[] | Record<string, unknown> = array ? [] : {};
      for (const key of entries) {
        const descriptor = descriptors[key];
        if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) fail('invalid_input');
        Object.defineProperty(output, key, { enumerable: true, value: visit(descriptor.value, depth + 1), writable: false });
      }
      return Object.freeze(output);
    } finally { seen.delete(selected); }
  }
  const parsed = visit(value, 0), serialized = JSON.stringify(parsed);
  if (Buffer.byteLength(serialized, 'utf8') > MAX_RESULT_BYTES) fail('invalid_input');
  return parsed;
}
function release(client: PostgresClientLike, destroy = false): void { try { client.release(destroy || undefined); } catch {} }

export class PostgresToshiCreditRepository implements ToshiCreditRepository {
  private readonly options: PostgresToshiCreditRepositoryOptions;
  constructor(options: PostgresToshiCreditRepositoryOptions) {
    if (!options || Object.keys(options).sort().join(',') !== 'audit,pool,role,timeouts' || options.role !== 'celebix_saas_app' || typeof options.audit !== 'function' || typeof options.pool?.connect !== 'function' || !options.timeouts || Object.keys(options.timeouts).sort().join(',') !== 'idleTransactionMs,lockMs,poolCheckoutMs,statementMs') fail('invalid_input');
    for (const value of Object.values(options.timeouts)) timeout(value);
    this.options = Object.freeze({ ...options, timeouts: Object.freeze({ ...options.timeouts }) });
  }
  private async command<T>(authority: ReturnType<typeof toshiAuthority>, action: string, payload: unknown, parse: (outcome: string, value: unknown) => T): Promise<T> {
    let client: PostgresClientLike;
    try { client = await acquirePostgresClient(this.options.pool, this.options.timeouts.poolCheckoutMs); } catch { fail(); }
    let began = false, terminal = false;
    try {
      // Wallet reads also expire abandoned reservations while holding the wallet lock.
      await client.query('BEGIN ISOLATION LEVEL READ COMMITTED'); began = true;
      for (const [name, value] of [['statement_timeout', this.options.timeouts.statementMs], ['lock_timeout', this.options.timeouts.lockMs], ['idle_in_transaction_session_timeout', this.options.timeouts.idleTransactionMs]] as const) await client.query(`SELECT pg_catalog.set_config('${name}',$1,true)`, [timeout(value)]);
      await client.query('SET LOCAL ROLE celebix_saas_app');
      const selected = await client.query('SELECT outcome,result_payload FROM saas.toshi_credit_command($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::text,$9::jsonb)', [authority.storeId, authority.principalId, authority.membershipId, authority.planId, authority.planCode, authority.planVersion, authority.now, action, JSON.stringify(payload)]);
      if (selected.rows.length !== 1 || selected.rowCount !== 1) fail();
      const row = exactToshiInput(selected.rows[0], ['outcome', 'result_payload']);
      if (typeof row.outcome !== 'string') fail();
      const denial = CODES.has(row.outcome) ? new ToshiCreditRepositoryError(row.outcome as ToshiCreditErrorCode) : null;
      const result = denial ? undefined : parse(row.outcome, row.result_payload);
      // Explicit native denials may also have expired stale holds. Preserve that
      // maintenance; malformed replies still roll back before reaching COMMIT.
      try { await client.query('COMMIT'); terminal = true; release(client); }
      catch {
        terminal = true; release(client, true);
        try { const pending = this.options.audit({ type: 'toshi_credit_commit_unknown' }); if (pending) void pending.catch(() => undefined); } catch {}
        // Never turn an ambiguous reserve into authorization to dispatch a provider.
        fail('commit_unknown');
      }
      if (denial) throw denial;
      return result as T;
    } catch (error) {
      if (!terminal) {
        try { if (began) await client.query('ROLLBACK'); release(client); } catch { release(client, true); }
      }
      if (error instanceof ToshiCreditRepositoryError) throw error;
      fail();
    }
  }
  async getWallet(value: ToshiCreditAuthorityInput): Promise<ToshiCreditWallet> {
    const a = input(() => { const raw = exactToshiInput(value, ['tenantContext', 'now']); return toshiAuthority(raw.tenantContext as never, raw.now as Date); });
    return this.command(a, 'wallet', {}, (outcome, result) => { if (outcome !== 'wallet') fail(); return parseToshiCreditWallet(result); });
  }
  async reserve(value: ReserveToshiCreditsInput): Promise<ReserveToshiCreditsResult> {
    const { a, payload } = input(() => {
      const raw = exactToshiInput(value, ['tenantContext', 'now', 'operationId', 'fingerprint', 'cost']);
      return { a: toshiAuthority(raw.tenantContext as never, raw.now as Date), payload: { operationId: toshiUuid(raw.operationId), fingerprint: fingerprint(raw.fingerprint), cost: boundedInteger(raw.cost, 1) } };
    });
    return this.command(a, 'reserve', payload, (outcome, value) => {
      if (!['created', 'replayed', 'pending'].includes(outcome)) fail();
      const raw = exactToshiInput(value, ['kind', 'status', 'result', 'chargedCredits']);
      if (raw.kind !== outcome || !['reserved', 'completed', 'failed', 'unknown'].includes(raw.status as string) || !Number.isSafeInteger(raw.chargedCredits) || (raw.chargedCredits as number) < 0 || (raw.chargedCredits as number) > payload.cost) fail();
      if (outcome === 'created' && raw.status !== 'reserved' || outcome === 'pending' && raw.status !== 'reserved' || outcome === 'replayed' && raw.status === 'reserved') fail();
      if (raw.status !== 'completed' && (raw.result !== null || raw.chargedCredits !== 0)) fail();
      return Object.freeze({ kind: raw.kind as ReserveToshiCreditsResult['kind'], status: raw.status as ReserveToshiCreditsResult['status'], result: raw.result === null ? null : resultJson(raw.result), chargedCredits: raw.chargedCredits as number });
    });
  }
  async complete(value: CompleteToshiCreditsInput): Promise<ToshiCreditWallet> {
    const { a, payload } = input(() => {
      const raw = exactToshiInput(value, ['tenantContext', 'now', 'operationId', 'fingerprint', 'result', 'chargedCredits']);
      if (raw.result === null) fail('invalid_input');
      return { a: toshiAuthority(raw.tenantContext as never, raw.now as Date), payload: { operationId: toshiUuid(raw.operationId), fingerprint: fingerprint(raw.fingerprint), result: resultJson(raw.result), chargedCredits: boundedInteger(raw.chargedCredits, 1) } };
    });
    return this.command(a, 'complete', payload, (outcome, result) => { if (outcome !== 'completed') fail(); return parseToshiCreditWallet(result); });
  }
  async fail(value: FailToshiCreditsInput): Promise<ToshiCreditWallet> {
    const { a, payload } = input(() => {
      if (!value || typeof value !== 'object') fail('invalid_input');
      const raw = exactToshiInput(value, ['tenantContext', 'now', 'operationId', 'fingerprint', 'safeCode', ...(Object.hasOwn(value, 'unknown') ? ['unknown'] : [])]);
      if (typeof raw.safeCode !== 'string' || !SAFE_CODE.test(raw.safeCode) || Object.hasOwn(raw, 'unknown') && typeof raw.unknown !== 'boolean') fail('invalid_input');
      return { a: toshiAuthority(raw.tenantContext as never, raw.now as Date), payload: { operationId: toshiUuid(raw.operationId), fingerprint: fingerprint(raw.fingerprint), safeCode: raw.safeCode, unknown: raw.unknown === true } };
    });
    return this.command(a, 'fail', payload, (outcome, result) => { if (!['failed', 'unknown', 'completed'].includes(outcome)) fail(); return parseToshiCreditWallet(result); });
  }
}
