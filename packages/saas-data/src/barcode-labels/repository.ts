import {
  parseBarcodeInternalCreateResult,
  parseBarcodeLabelListQuery,
  parseBarcodeLabelListResult,
  parseBarcodeLabelTemplate,
  parseBarcodePrintJob,
  parseBarcodePrintJobList,
  type TenantContext,
} from "@celebix/saas-contracts";
import {
  acquirePostgresClient,
  type PostgresClientLike,
} from "../postgres/pool.ts";
import {
  decodeBarcodeLabelCursor,
  encodeBarcodeLabelCursor,
  type BarcodeLabelCursorAnchor,
} from "./cursor.ts";
import {
  BARCODE_LABEL_ERROR_CODES,
  BarcodeLabelRepositoryError,
  type BarcodeLabelErrorCode,
} from "./errors.ts";
import type {
  BarcodeLabelRepository,
  PostgresBarcodeLabelRepositoryOptions,
} from "./types.ts";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SQL = Object.freeze({
  list: "SELECT outcome,result_payload FROM saas.barcode_label_list($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::text,$9::text,$10::text,$11::uuid,$12::uuid,$13::uuid,$14::boolean,$15::text,$16::integer,$17::integer,$18::text,$19::integer,$20::uuid)",
  listTemplates:
    "SELECT outcome,result_payload FROM saas.barcode_label_template_list($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz)",
  saveTemplate:
    "SELECT outcome,result_payload FROM saas.barcode_label_template_save($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid,$9::uuid,$10::bigint,$11::text,$12::jsonb,$13::boolean)",
  archiveTemplate:
    "SELECT outcome,result_payload FROM saas.barcode_label_template_archive($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid,$9::uuid,$10::bigint)",
  internal:
    "SELECT outcome,result_payload FROM saas.barcode_label_generate_internal($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid,$9::jsonb)",
  listJobs:
    "SELECT outcome,result_payload FROM saas.barcode_print_job_list($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz)",
  createJob:
    "SELECT outcome,result_payload FROM saas.barcode_print_job_create($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid,$9::uuid,$10::uuid,$11::bigint,$12::text,$13::jsonb,$14::text,$15::text,$16::integer,$17::jsonb)",
  getJob:
    "SELECT outcome,result_payload FROM saas.barcode_print_job_get($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid)",
});

const unavailable = (): BarcodeLabelRepositoryError =>
  new BarcodeLabelRepositoryError("unavailable");
const timeout = (value: number) => {
  if (!Number.isSafeInteger(value) || value < 1 || value > 60000)
    throw unavailable();
  return `${value}ms`;
};
function authority(context: TenantContext, now: Date): unknown[] {
  if (
    !context ||
    !UUID.test(context.store.id) ||
    !UUID.test(context.principal.id) ||
    !UUID.test(context.membership.id) ||
    !UUID.test(context.entitlements.planId) ||
    !(now instanceof Date) ||
    !Number.isFinite(now.getTime())
  )
    throw new BarcodeLabelRepositoryError("invalid_input");
  return [
    context.store.id,
    context.principal.id,
    context.membership.id,
    context.entitlements.planId,
    context.entitlements.planCode,
    context.entitlements.version,
    now,
  ];
}
function selected(
  result: Readonly<{ rows: unknown[]; rowCount?: number | null }>,
): { outcome: string; payload: unknown } {
  if (
    result.rowCount !== 1 ||
    !Array.isArray(result.rows) ||
    result.rows.length !== 1
  )
    throw unavailable();
  const value = result.rows[0];
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw unavailable();
  const row = value as Record<string, unknown>;
  if (
    Object.keys(row).sort().join(",") !== "outcome,result_payload" ||
    typeof row.outcome !== "string"
  )
    throw unavailable();
  return { outcome: row.outcome, payload: row.result_payload };
}
function mapped(outcome: string): BarcodeLabelRepositoryError | undefined {
  const aliases: Record<string, BarcodeLabelErrorCode> = {
    template_not_found: "resource_not_found",
    job_not_found: "resource_not_found",
    variant_not_found: "resource_not_found",
    stale_version: "version_conflict",
    operation_replayed: "operation_mismatch",
  };
  const code =
    aliases[outcome] ??
    (BARCODE_LABEL_ERROR_CODES.includes(outcome as never)
      ? (outcome as BarcodeLabelErrorCode)
      : undefined);
  return code === undefined ? undefined : new BarcodeLabelRepositoryError(code);
}
function listPayload(value: unknown): {
  items: unknown[];
  catalogTotal: unknown;
  storeName: unknown;
  nextAnchor?: BarcodeLabelCursorAnchor;
} {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw unavailable();
  const raw = value as Record<string, unknown>;
  if (!Array.isArray(raw.items)) throw unavailable();
  const next = raw.nextAnchor;
  if (next === undefined)
    return { items: raw.items, catalogTotal: raw.catalogTotal, storeName: raw.storeName };
  if (typeof next !== "object" || next === null || Array.isArray(next))
    throw unavailable();
  const anchor = next as Record<string, unknown>;
  if (
    ![0, 1].includes(anchor.sortNullRank as number) ||
    (typeof anchor.sortValue !== "string" &&
      !Number.isSafeInteger(anchor.sortValue)) ||
    typeof anchor.variantId !== "string"
  )
    throw unavailable();
  return {
    items: raw.items,
    catalogTotal: raw.catalogTotal,
    storeName: raw.storeName,
    nextAnchor: {
      sortNullRank: anchor.sortNullRank as 0 | 1,
      sortValue: anchor.sortValue as string | number,
      variantId: anchor.variantId,
    },
  };
}

export class PostgresBarcodeLabelRepository implements BarcodeLabelRepository {
  private readonly options: PostgresBarcodeLabelRepositoryOptions;
  constructor(options: PostgresBarcodeLabelRepositoryOptions) {
    if (
      !options ||
      options.role !== "celebix_saas_app" ||
      typeof options.uuid !== "function" ||
      typeof options.audit !== "function"
    )
      throw unavailable();
    Object.values(options.timeouts).forEach(timeout);
    this.options = Object.freeze({
      ...options,
      timeouts: Object.freeze({ ...options.timeouts }),
    });
  }
  private async run(
    text: string,
    values: unknown[],
    mode: "read" | "write",
    success: readonly string[],
    recoverCommitUnknown = true,
  ): Promise<{ outcome: string; payload: unknown }> {
    let client: PostgresClientLike | undefined;
    let began = false;
    let terminal = false;
    try {
      client = await acquirePostgresClient(
        this.options.pool,
        this.options.timeouts.poolCheckoutMs,
      );
      await client.query(
        mode === "read"
          ? "BEGIN READ ONLY"
          : "BEGIN ISOLATION LEVEL READ COMMITTED",
      );
      began = true;
      await client.query(
        "SELECT pg_catalog.set_config('statement_timeout', $1, true)",
        [timeout(this.options.timeouts.statementMs)],
      );
      await client.query(
        "SELECT pg_catalog.set_config('lock_timeout', $1, true)",
        [timeout(this.options.timeouts.lockMs)],
      );
      await client.query(
        "SELECT pg_catalog.set_config('idle_in_transaction_session_timeout', $1, true)",
        [timeout(this.options.timeouts.idleTransactionMs)],
      );
      await client.query("SET LOCAL ROLE celebix_saas_app");
      const result = selected(await client.query(text, values));
      const known = mapped(result.outcome);
      if (known && result.outcome !== "operation_replayed") throw known;
      if (
        !success.includes(result.outcome) &&
        result.outcome !== "operation_replayed"
      )
        throw unavailable();
      try {
        await client.query("COMMIT");
        terminal = true;
        client.release();
      } catch {
        terminal = true;
        client.release(true);
        client = undefined;
        if (mode === "write") {
          try {
            const pending = this.options.audit(
              Object.freeze({ type: "barcode_label_commit_unknown" }),
            );
            if (pending) void pending.catch(() => undefined);
          } catch {}
          if (recoverCommitUnknown)
            return this.run(text, values, mode, success, false);
        }
        throw unavailable();
      }
      return result;
    } catch (error) {
      if (client) {
        if (began && !terminal) {
          try {
            await client.query("ROLLBACK");
            client.release();
          } catch {
            client.release(true);
          }
        } else {
          try {
            client.release(true);
          } catch {}
        }
      }
      if (error instanceof BarcodeLabelRepositoryError) throw error;
      throw unavailable();
    }
  }
  async list(input: Parameters<BarcodeLabelRepository["list"]>[0]) {
    const query = parseBarcodeLabelListQuery(input.query);
    const anchor = decodeBarcodeLabelCursor(
      input.cursor,
      input.tenantContext.store.id,
      query,
    );
    const result = await this.run(
      SQL.list,
      [
        ...authority(input.tenantContext, input.now),
        query.q ?? null,
        query.status ?? null,
        query.stockState ?? null,
        query.categoryId ?? null,
        query.brandId ?? null,
        query.productId ?? null,
        query.hasBarcode ?? null,
        query.sort,
        query.pageSize,
        anchor?.sortNullRank ?? null,
        typeof anchor?.sortValue === "string" ? anchor.sortValue : null,
        typeof anchor?.sortValue === "number" ? anchor.sortValue : null,
        anchor?.variantId ?? null,
      ],
      "read",
      ["listed"],
    );
    const unpacked = listPayload(result.payload);
    return parseBarcodeLabelListResult({
      items: unpacked.items,
      catalogTotal: unpacked.catalogTotal,
      storeName: unpacked.storeName,
      ...(unpacked.nextAnchor
        ? {
            nextCursor: encodeBarcodeLabelCursor(
              input.tenantContext.store.id,
              query,
              unpacked.nextAnchor,
            ),
          }
        : {}),
    });
  }
  async listTemplates(
    input: Parameters<BarcodeLabelRepository["listTemplates"]>[0],
  ) {
    const result = await this.run(
      SQL.listTemplates,
      authority(input.tenantContext, input.now),
      "read",
      ["listed"],
    );
    if (!Array.isArray(result.payload)) throw unavailable();
    return Object.freeze(result.payload.map(parseBarcodeLabelTemplate));
  }
  async saveTemplate(
    input: Parameters<BarcodeLabelRepository["saveTemplate"]>[0],
  ) {
    const id = input.templateId ?? input.operationId;
    const result = await this.run(
      SQL.saveTemplate,
      [
        ...authority(input.tenantContext, input.now),
        input.operationId,
        id,
        input.expectedVersion ?? null,
        input.name,
        JSON.stringify(input.config),
        input.makeDefault,
      ],
      "write",
      ["saved"],
    );
    return parseBarcodeLabelTemplate(result.payload);
  }
  async archiveTemplate(
    input: Parameters<BarcodeLabelRepository["archiveTemplate"]>[0],
  ) {
    const result = await this.run(
      SQL.archiveTemplate,
      [
        ...authority(input.tenantContext, input.now),
        input.operationId,
        input.templateId,
        input.expectedVersion,
      ],
      "write",
      ["archived"],
    );
    return parseBarcodeLabelTemplate(result.payload);
  }
  async generateInternal(
    input: Parameters<BarcodeLabelRepository["generateInternal"]>[0],
  ) {
    const result = await this.run(
      SQL.internal,
      [
        ...authority(input.tenantContext, input.now),
        input.operationId,
        JSON.stringify(input.targets),
      ],
      "write",
      ["generated"],
    );
    return parseBarcodeInternalCreateResult(result.payload);
  }
  async listJobs(input: Parameters<BarcodeLabelRepository["listJobs"]>[0]) {
    const result = await this.run(
      SQL.listJobs,
      authority(input.tenantContext, input.now),
      "read",
      ["listed"],
    );
    return parseBarcodePrintJobList(result.payload);
  }
  async createJob(input: Parameters<BarcodeLabelRepository["createJob"]>[0]) {
    const id = input.operationId;
    const result = await this.run(
      SQL.createJob,
      [
        ...authority(input.tenantContext, input.now),
        input.operationId,
        id,
        input.template.kind === "custom" ? input.template.templateId : null,
        input.template.kind === "custom" ? input.template.expectedVersion : null,
        input.templateName,
        JSON.stringify(input.templateConfig),
        input.outputType,
        input.printerProfile,
        input.startCell,
        JSON.stringify(input.targets),
      ],
      "write",
      ["created"],
    );
    return parseBarcodePrintJob(result.payload);
  }
  async getJob(input: Parameters<BarcodeLabelRepository["getJob"]>[0]) {
    const result = await this.run(
      SQL.getJob,
      [...authority(input.tenantContext, input.now), input.jobId],
      "read",
      ["found"],
    );
    return parseBarcodePrintJob(result.payload);
  }
}
