import 'server-only';
import { createHash } from 'node:crypto';
import { parseToshiProviderConnection, type ToshiProviderConnection } from '@celebix/saas-contracts';
import type { ToshiProviderRepository, ToshiProviderConnectionIdentity, ToshiProviderCredentialAuthority } from '@celebix/saas-data';
import { acquirePostgresClient, type PostgresPoolLike, type PostgresTimeoutOptions, type PostgresClientLike } from '../../../../packages/saas-data/src/postgres/pool.ts';
import { exactToshiInput, toshiAuthority, toshiDigest, toshiModels, toshiSealedCredential, toshiSelectedModel, toshiUuid, toshiVersion } from '../../../../packages/saas-data/src/toshi-providers/canonical.ts';
import { TOSHI_PROVIDER_REPOSITORY_ERROR_CODES, ToshiProviderRepositoryError, type ToshiProviderRepositoryErrorCode } from '../../../../packages/saas-data/src/toshi-providers/errors.ts';
import type { ServerPanelAccessRuntime } from '../server-panel-access/runtime.ts';
export type CentralToshiRepository = Pick<ToshiProviderRepository, 'getAuthority' | 'getConnectionIdentity' | 'connect'>;
const RUNTIMES = new WeakMap<ServerPanelAccessRuntime, CentralToshiRepository>();
const METHODS = ['getAuthority', 'getConnectionIdentity', 'connect'] as const;
const CODES = new Set<string>(TOSHI_PROVIDER_REPOSITORY_ERROR_CODES);
function unavailable(): never { throw new ToshiProviderRepositoryError('unavailable'); }
function invalid(): never { throw new ToshiProviderRepositoryError('invalid_input'); }
function timeout(value: number): string { if (!Number.isSafeInteger(value) || value < 1 || value > 60_000) invalid(); return `${value}ms`; }
function release(client: PostgresClientLike, destroy = false): void { try { client.release(destroy || undefined); } catch {} }
function authorityInput(value: unknown, keys: readonly string[]) { const raw = exactToshiInput(value, keys); if (raw.provider !== 'deepseek') invalid(); return { raw, authority: toshiAuthority(raw.tenantContext as never, raw.now as Date) }; }
function selectedAuthority(value: unknown): ToshiProviderCredentialAuthority {
  try {
    const raw = exactToshiInput(value, ['configId', 'provider', 'selectedModel', 'sealedCredentials', 'credentialVersion', 'version']);
    if (raw.provider !== 'deepseek') unavailable();
    // An older DeepSeek binding can be read only by the server helper, which
    // checks the sealed key and rotates it before any metered dispatch.
    return Object.freeze({ configId: toshiUuid(raw.configId), provider: 'deepseek', selectedModel: toshiSelectedModel(raw.selectedModel), sealedCredentials: toshiSealedCredential(raw.sealedCredentials), credentialVersion: toshiVersion(raw.credentialVersion, 1), version: toshiVersion(raw.version, 1) });
  } catch { unavailable(); }
}
function selectedIdentity(value: unknown): ToshiProviderConnectionIdentity {
  try { const raw = exactToshiInput(value, ['configId', 'credentialVersion', 'version']); return Object.freeze({ configId: toshiUuid(raw.configId), credentialVersion: toshiVersion(raw.credentialVersion, 1), version: toshiVersion(raw.version, 1) }); } catch { unavailable(); }
}
export function createPostgresCentralToshiRepository(options: Readonly<{ pool: PostgresPoolLike; timeouts: PostgresTimeoutOptions }>): CentralToshiRepository {
  if (!options || Object.keys(options).sort().join(',') !== 'pool,timeouts' || typeof options.pool?.connect !== 'function' || !options.timeouts || Object.keys(options.timeouts).sort().join(',') !== 'idleTransactionMs,lockMs,poolCheckoutMs,statementMs') invalid();
  const timeouts = Object.freeze({ ...options.timeouts }); for (const value of Object.values(timeouts)) timeout(value);
  type Authority = ReturnType<typeof toshiAuthority>;
  async function command<T>(a: Authority, action: string, payload: unknown, parse: (outcome: string, value: unknown) => T, recover?: () => Promise<T>): Promise<T> {
    let client: PostgresClientLike;
    try { client = await acquirePostgresClient(options.pool, timeouts.poolCheckoutMs); } catch { unavailable(); }
    let began = false, terminal = false;
    try {
      await client.query(action === 'connect' ? 'BEGIN ISOLATION LEVEL READ COMMITTED' : 'BEGIN READ ONLY'); began = true;
      for (const [name, value] of [['statement_timeout', timeouts.statementMs], ['lock_timeout', timeouts.lockMs], ['idle_in_transaction_session_timeout', timeouts.idleTransactionMs]] as const) await client.query(`SELECT pg_catalog.set_config('${name}',$1,true)`, [timeout(value)]);
      await client.query('SET LOCAL ROLE celebix_saas_app');
      const result = await client.query('SELECT outcome,result_payload FROM saas.toshi_central_binding_command($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::text,$9::jsonb)', [a.storeId, a.principalId, a.membershipId, a.planId, a.planCode, a.planVersion, a.now, action, JSON.stringify(payload)]);
      if (result.rows.length !== 1 || result.rowCount !== 1) unavailable();
      const row = exactToshiInput(result.rows[0], ['outcome', 'result_payload']);
      if (typeof row.outcome !== 'string') unavailable();
      if (CODES.has(row.outcome)) throw new ToshiProviderRepositoryError(row.outcome as ToshiProviderRepositoryErrorCode);
      const selected = parse(row.outcome, row.result_payload);
      try { await client.query('COMMIT'); terminal = true; release(client); }
      catch { terminal = true; release(client, true); if (recover) return await recover(); unavailable(); }
      return selected;
    } catch (error) {
      if (!terminal) { try { if (began) await client.query('ROLLBACK'); release(client); } catch { release(client, true); } }
      if (error instanceof ToshiProviderRepositoryError || error instanceof Error && ['connection_missing', 'connection_revoked'].includes(String((error as { code?: unknown }).code))) throw error;
      unavailable();
    }
  }
  return Object.freeze({
    async getAuthority(input) {
      const { authority } = authorityInput(input, ['tenantContext', 'now', 'provider']);
      return command(authority, 'authority', {}, (outcome, value) => {
        if (outcome === 'not_found' && value === null) throw Object.assign(Error('connection_missing'), { code: 'connection_missing' });
        if (outcome !== 'found') unavailable(); return selectedAuthority(value);
      });
    },
    async getConnectionIdentity(input) {
      const { authority } = authorityInput(input, ['tenantContext', 'now', 'provider']);
      return command(authority, 'identity', {}, (outcome, value) => { if (outcome === 'not_found' && value === null) return null; if (outcome !== 'found') unavailable(); return selectedIdentity(value); });
    },
    async connect(input) {
      const { raw, authority } = authorityInput(input, ['tenantContext', 'now', 'provider', 'operationId', 'configId', 'sealedCredentials', 'credentialDigest', 'credentialVersion', 'maskedKey', 'selectedModel', 'availableModels', 'expectedVersion']);
      const operationId = toshiUuid(raw.operationId), configId = toshiUuid(raw.configId), sealedCredentials = toshiSealedCredential(raw.sealedCredentials), credentialDigest = toshiDigest(raw.credentialDigest), credentialVersion = toshiVersion(raw.credentialVersion, 1), expectedVersion = toshiVersion(raw.expectedVersion, 0), availableModels = toshiModels(raw.availableModels);
      if (raw.maskedKey !== '••••oshi' || raw.selectedModel !== 'deepseek-flash' || JSON.stringify(availableModels) !== '[{"id":"deepseek-flash","label":"Toshi"}]' || expectedVersion > 9007199254740990) invalid();
      const canonical = { configId, provider: 'deepseek', sealedCredentials, credentialDigest, credentialVersion, maskedKey: '••••oshi', selectedModel: 'deepseek-flash', availableModels, expectedVersion };
      const fingerprint = createHash('sha256').update(JSON.stringify({ kind: 'toshi_central_binding_v1', storeId: authority.storeId, principalId: authority.principalId, membershipId: authority.membershipId, ...canonical })).digest('hex');
      const parse = (outcome: string, value: unknown): ToshiProviderConnection => {
        if (!['connected', 'operation_replayed'].includes(outcome)) unavailable();
        let selected: ToshiProviderConnection; try { selected = parseToshiProviderConnection(value); } catch { unavailable(); }
        if (selected.provider !== 'deepseek' || selected.status !== 'active' || selected.maskedKey !== '••••oshi' || selected.selectedModel !== 'deepseek-flash' || selected.version !== expectedVersion + 1 || expectedVersion === 0 && selected.isDefault || JSON.stringify(selected.availableModels) !== JSON.stringify(availableModels)) unavailable();
        return selected;
      };
      return command(authority, 'connect', { operationId, fingerprint, ...canonical }, parse, () => command(authority, 'recover', { operationId, fingerprint }, parse));
    },
  } satisfies CentralToshiRepository);
}
export function registerServerCentralToshiRepository(access: ServerPanelAccessRuntime, repository: CentralToshiRepository): CentralToshiRepository {
  if (!access || access.readiness.mode !== 'approved_staging' || !access.panelOrigin || RUNTIMES.has(access) || !repository || METHODS.some(method => typeof repository[method] !== 'function')) throw Error('server_central_toshi_repository_invalid');
  const facade = Object.freeze(Object.fromEntries(METHODS.map(method => [method, repository[method].bind(repository)])) as unknown as CentralToshiRepository); RUNTIMES.set(access, facade); return facade;
}
export function resolveServerCentralToshiRepository(access: ServerPanelAccessRuntime): CentralToshiRepository | null { try { return access?.readiness.mode === 'approved_staging' && access.panelOrigin ? RUNTIMES.get(access) ?? null : null; } catch { return null; } }
