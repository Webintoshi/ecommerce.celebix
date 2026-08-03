import {
  parsePublicStorefrontDesign,
  parseStorefrontDesignDocument,
  parseStorefrontDesignWorkspace,
  type StorefrontDesignDraftMutation,
  type StorefrontDesignPublicationMutation,
  type StorefrontDesignWorkspace,
} from "@celebix/saas-contracts";

import { acquirePostgresClient, type PostgresClientLike } from "../postgres/pool.ts";
import {
  designAuthority,
  designDigest,
  designDimension,
  designFingerprint,
  designJson,
  designMediaType,
  designText,
  designUuid,
  designVersion,
  exactDesignInput,
} from "./canonical.ts";
import { StorefrontDesignRepositoryError } from "./errors.ts";
import type {
  PostgresStorefrontDesignRepositoryOptions,
  PublishStorefrontDesignInput,
  ReserveStorefrontDesignMediaInput,
  SaveStorefrontDesignDraftInput,
  StorefrontDesignAuthorityInput,
  StorefrontDesignMediaReservation,
  StorefrontDesignRepository,
} from "./types.ts";

type Authority = ReturnType<typeof designAuthority>;
type Spec = Readonly<{ text: string; values: unknown[] }>;
type Outcome = Readonly<{ outcome: string; result: unknown }>;

function fail(code: ConstructorParameters<typeof StorefrontDesignRepositoryError>[0] = "unavailable"): never { throw new StorefrontDesignRepositoryError(code); }
function timeout(value: number): string { if (!Number.isSafeInteger(value) || value < 1 || value > 60_000) fail(); return `${value}ms`; }
function release(client: PostgresClientLike, destroy = false): void { try { client.release(destroy || undefined); } catch {} }
function payload(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) fail();
  const parsed = value as Record<string, unknown>;
  if (Object.keys(parsed).sort().join(",") !== [...keys].sort().join(",")) fail();
  return parsed;
}
function row(value: Readonly<{ rows: unknown[]; rowCount?: number | null }>): Outcome {
  if (value.rowCount !== 1 || value.rows.length !== 1) fail();
  const parsed = payload(value.rows[0], ["outcome", "result_payload"]);
  if (typeof parsed.outcome !== "string") fail();
  return Object.freeze({ outcome: parsed.outcome, result: parsed.result_payload });
}
function authorityValues(authority: Authority): unknown[] { return [authority.storeId, authority.principalId, authority.membershipId, authority.planId, authority.planCode, authority.planVersion, authority.now]; }
function timestamp(value: unknown): string { if (typeof value !== "string" || new Date(value).toISOString() !== value) fail(); return value; }
function mutationDraft(value: unknown): StorefrontDesignDraftMutation {
  const parsed = payload(value, ["draftVersion", "draftUpdatedAt", "draft"]);
  return Object.freeze({ draftVersion: designVersion(parsed.draftVersion), draftUpdatedAt: timestamp(parsed.draftUpdatedAt), draft: parseStorefrontDesignDocument(parsed.draft) });
}
function mutationPublication(value: unknown): StorefrontDesignPublicationMutation {
  const parsed = payload(value, ["draftVersion", "publishedVersion", "publishedAt", "published"]);
  const publishedVersion = designVersion(parsed.publishedVersion);
  const publishedAt = timestamp(parsed.publishedAt);
  const published = parsePublicStorefrontDesign(parsed.published);
  if (published.publicationVersion !== publishedVersion || published.publishedAt !== publishedAt) fail();
  return Object.freeze({ draftVersion: designVersion(parsed.draftVersion), publishedVersion, publishedAt, published });
}
function mediaReservation(value: unknown): StorefrontDesignMediaReservation {
  const parsed = payload(value, ["id", "url", "altText", "mediaType", "width", "height", "objectKey"]);
  const id = designUuid(parsed.id);
  const mediaType = designMediaType(parsed.mediaType);
  const extension = mediaType === "image/jpeg" ? "jpg" : mediaType.split("/")[1];
  const objectKey = designText(parsed.objectKey, 256);
  if (!objectKey.endsWith(`/design/${id}.${extension}`)) fail();
  const url = designText(parsed.url, 2048);
  if (url !== `https://media.saas-staging.celebix.site/${objectKey}`) fail();
  return Object.freeze({ id, url, altText: designText(parsed.altText, 500), mediaType, width: designDimension(parsed.width, 8192), height: designDimension(parsed.height, 8192), objectKey });
}

export class PostgresStorefrontDesignRepository implements StorefrontDesignRepository {
  private readonly options: PostgresStorefrontDesignRepositoryOptions;
  constructor(options: PostgresStorefrontDesignRepositoryOptions) {
    try {
      if (!options || typeof options !== "object" || Array.isArray(options) || Object.keys(options).sort().join(",") !== "audit,pool,role,timeouts" || options.role !== "celebix_saas_app" || typeof options.audit !== "function" || !options.pool || typeof options.pool.connect !== "function" || !options.timeouts || Object.keys(options.timeouts).sort().join(",") !== "idleTransactionMs,lockMs,poolCheckoutMs,statementMs") fail();
      for (const value of Object.values(options.timeouts)) timeout(value);
      this.options = Object.freeze({ ...options, timeouts: Object.freeze({ ...options.timeouts }) });
    } catch (error) { if (error instanceof StorefrontDesignRepositoryError) throw error; fail(); }
  }

  private async acquire(): Promise<PostgresClientLike> { try { return await acquirePostgresClient(this.options.pool, this.options.timeouts.poolCheckoutMs); } catch { fail(); } }
  private async configure(client: PostgresClientLike): Promise<void> {
    await client.query("SELECT pg_catalog.set_config('statement_timeout', $1, true)", [timeout(this.options.timeouts.statementMs)]);
    await client.query("SELECT pg_catalog.set_config('lock_timeout', $1, true)", [timeout(this.options.timeouts.lockMs)]);
    await client.query("SELECT pg_catalog.set_config('idle_in_transaction_session_timeout', $1, true)", [timeout(this.options.timeouts.idleTransactionMs)]);
    await client.query("SET LOCAL ROLE celebix_saas_app");
  }
  private async rollback(client: PostgresClientLike): Promise<void> { try { await client.query("ROLLBACK"); release(client); } catch { release(client, true); } }
  private known(outcome: string): never {
    if (["design_input_invalid", "design_media_invalid", "design_publish_invalid"].includes(outcome)) fail("invalid_input");
    if (["draft_version_conflict", "published_version_conflict"].includes(outcome)) fail("version_conflict");
    if (outcome === "operation_mismatch") fail("operation_mismatch");
    if (["design_not_found", "storefront_not_found"].includes(outcome)) fail("not_found");
    if (outcome === "design_media_conflict") fail("conflict");
    if (["membership_denied", "store_inactive", "feature_not_enabled", "durable_authority_invalid"].includes(outcome)) fail(outcome as ConstructorParameters<typeof StorefrontDesignRepositoryError>[0]);
    fail("unavailable");
  }
  private async read<T>(spec: Spec, expected: string, parser: (value: unknown) => T): Promise<T> {
    const client = await this.acquire(); let began = false; let terminal = false;
    try {
      await client.query("BEGIN READ ONLY"); began = true; await this.configure(client);
      const result = row(await client.query(spec.text, spec.values));
      if (result.outcome !== expected) this.known(result.outcome);
      const parsed = parser(result.result);
      try { await client.query("COMMIT"); terminal = true; release(client); } catch { terminal = true; release(client, true); fail(); }
      return parsed;
    } catch (error) {
      if (began && !terminal) await this.rollback(client); else if (!began && !terminal) release(client, true);
      if (error instanceof StorefrontDesignRepositoryError) throw error; fail();
    }
  }
  private audit(): void { try { const pending = this.options.audit({ type: "storefront_design_commit_unknown" }); if (pending) void pending.catch(() => undefined); } catch {} }
  private async mutate<T>(spec: Spec, expected: string, parser: (value: unknown) => T, recover: (observed: T) => Promise<T>): Promise<T> {
    const client = await this.acquire(); let began = false; let terminal = false;
    try {
      await client.query("BEGIN ISOLATION LEVEL READ COMMITTED"); began = true; await this.configure(client);
      const result = row(await client.query(spec.text, spec.values));
      if (result.outcome !== expected && result.outcome !== "operation_replayed") this.known(result.outcome);
      const parsed = parser(result.result);
      try { await client.query("COMMIT"); terminal = true; release(client); return parsed; }
      catch { terminal = true; release(client, true); this.audit(); return await recover(parsed); }
    } catch (error) {
      if (began && !terminal) await this.rollback(client); else if (!began && !terminal) release(client, true);
      if (error instanceof StorefrontDesignRepositoryError) throw error; fail();
    }
  }
  private authority(input: unknown, keys: readonly string[]): { parsed: Record<string, unknown>; authority: Authority } {
    const parsed = exactDesignInput(input, keys);
    return { parsed, authority: designAuthority(parsed.tenantContext as never, parsed.now as Date) };
  }
  async getWorkspace(input: StorefrontDesignAuthorityInput): Promise<StorefrontDesignWorkspace> {
    const { authority } = this.authority(input, ["tenantContext", "now"]);
    return this.read({ text: "SELECT outcome,result_payload FROM saas.storefront_design_get($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz)", values: authorityValues(authority) }, "found", (value) => { try { return parseStorefrontDesignWorkspace(value); } catch { fail(); } });
  }
  async saveDraft(input: SaveStorefrontDesignDraftInput): Promise<StorefrontDesignDraftMutation> {
    const { parsed, authority } = this.authority(input, ["tenantContext", "now", "operationId", "expectedDraftVersion", "design"]);
    const operationId = designUuid(parsed.operationId); const expectedDraftVersion = designVersion(parsed.expectedDraftVersion);
    let design; try { design = parseStorefrontDesignDocument(parsed.design); } catch { fail("invalid_input"); }
    const fingerprint = designFingerprint("save_draft", authority.storeId, { expectedDraftVersion, design });
    return this.mutate({ text: "SELECT outcome,result_payload FROM saas.storefront_design_save_draft($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid,$9::text,$10::bigint,$11::jsonb)", values: [...authorityValues(authority), operationId, fingerprint, expectedDraftVersion, designJson(design)] }, "saved", mutationDraft, async (observed) => {
      const workspace = await this.getWorkspace({ tenantContext: parsed.tenantContext as never, now: parsed.now as Date });
      if (workspace.draftVersion !== observed.draftVersion || workspace.draftUpdatedAt !== observed.draftUpdatedAt || JSON.stringify(workspace.draft) !== JSON.stringify(observed.draft)) fail();
      return observed;
    });
  }
  async publish(input: PublishStorefrontDesignInput): Promise<StorefrontDesignPublicationMutation> {
    const { parsed, authority } = this.authority(input, ["tenantContext", "now", "operationId", "expectedDraftVersion", "expectedPublishedVersion"]);
    const operationId = designUuid(parsed.operationId); const expectedDraftVersion = designVersion(parsed.expectedDraftVersion); const expectedPublishedVersion = designVersion(parsed.expectedPublishedVersion);
    const fingerprint = designFingerprint("publish", authority.storeId, { expectedDraftVersion, expectedPublishedVersion });
    return this.mutate({ text: "SELECT outcome,result_payload FROM saas.storefront_design_publish($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid,$9::text,$10::bigint,$11::bigint)", values: [...authorityValues(authority), operationId, fingerprint, expectedDraftVersion, expectedPublishedVersion] }, "published", mutationPublication, async (observed) => {
      const workspace = await this.getWorkspace({ tenantContext: parsed.tenantContext as never, now: parsed.now as Date });
      if (workspace.publishedVersion !== observed.publishedVersion || workspace.publishedAt !== observed.publishedAt || JSON.stringify(workspace.published) !== JSON.stringify(observed.published)) fail();
      return observed;
    });
  }
  async reserveMedia(input: ReserveStorefrontDesignMediaInput): Promise<StorefrontDesignMediaReservation> {
    const { parsed, authority } = this.authority(input, ["tenantContext", "now", "operationId", "mediaId", "mediaType", "altText", "width", "height", "contentLength", "contentSha256"]);
    const operationId = designUuid(parsed.operationId); const mediaId = designUuid(parsed.mediaId); const mediaType = designMediaType(parsed.mediaType); const altText = designText(parsed.altText, 500); const width = designDimension(parsed.width, 8192); const height = designDimension(parsed.height, 8192); const contentLength = designDimension(parsed.contentLength, 5 * 1024 * 1024); const contentSha256 = designDigest(parsed.contentSha256);
    const fingerprint = designFingerprint("media_reserve", authority.storeId, { mediaId, mediaType, altText, width, height, contentLength, contentSha256 });
    return this.mutate({ text: "SELECT outcome,result_payload FROM saas.storefront_design_media_reserve($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid,$9::text,$10::uuid,$11::text,$12::text,$13::integer,$14::integer,$15::bigint,$16::text)", values: [...authorityValues(authority), operationId, fingerprint, mediaId, mediaType, altText, width, height, contentLength, contentSha256] }, "reserved", mediaReservation, async (observed) => {
      const workspace = await this.getWorkspace({ tenantContext: parsed.tenantContext as never, now: parsed.now as Date });
      const media = workspace.media.find((item) => item.id === observed.id);
      if (!media || media.url !== observed.url || media.mediaType !== observed.mediaType || media.width !== observed.width || media.height !== observed.height) fail();
      return observed;
    });
  }
}
