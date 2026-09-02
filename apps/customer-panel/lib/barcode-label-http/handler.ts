import "server-only";
import { randomUUID } from "node:crypto";
import {
  parseBarcodeInternalCreateIntent,
  parseBarcodeLabelListQuery,
  parseBarcodeLabelTemplateSaveIntent,
  parseBarcodePrintJobCreateIntent,
  isMerchantActionAllowed,
  type TenantContext,
} from "@celebix/saas-contracts";
import {
  BarcodeLabelRepositoryError,
  type BarcodeLabelRepository,
} from "@celebix/saas-data";
import { approvedPanelMutationOriginForStore } from "../panel-origin-authority.ts";
import { readPersistentPanelSessionCookie } from "../server-panel-session-controls/request-input.ts";
import type { ServerPanelAccessResult } from "../server-panel-access/access.ts";
import { resolveDefaultServerBarcodeLabelRuntime } from "../server-barcode-labels/default.ts";
import type { ServerBarcodeLabelRuntime } from "../server-barcode-labels/runtime.ts";
import { getSystemBarcodeLabelTemplate } from "../barcode-labels/system-templates.ts";
import { buildLabelDocument } from "../barcode-labels/document.ts";
import { renderLabelPdf } from "../barcode-labels/pdf.ts";
import { renderLabelZpl } from "../barcode-labels/zpl.ts";
import { renderBarcodeSvg } from "../barcode-labels/render-barcode.ts";
import { paginateLabelDocument } from "../barcode-labels/pages.ts";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const PRIVATE_HEADERS = [
  "authorization",
  "x-panel-session-credential",
  "x-store-id",
  "x-tenant-id",
  "x-principal-id",
  "x-membership-id",
  "x-plan-id",
  "x-database-role",
];
type Authorized = Readonly<{
  runtime: ServerBarcodeLabelRuntime;
  tenantContext: TenantContext;
  now: Date;
}>;
type Dependencies = Readonly<{
  resolveRuntime(): Promise<ServerBarcodeLabelRuntime | null>;
  now(): Date;
  requestId(): string;
}>;

function response(value: unknown, status = 200, headers?: HeadersInit) {
  return Response.json(value, {
    status,
    headers: {
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      ...(headers ?? {}),
    },
  });
}
function failure(code: string, status: number, headers?: HeadersInit) {
  return response({ code }, status, headers);
}
function repositoryFailure(error: unknown): Response {
  if (!(error instanceof BarcodeLabelRepositoryError))
    return failure("unavailable", 503);
  if (error.code === "invalid_input") return failure("invalid_input", 400);
  if (error.code === "resource_not_found") return failure("not_found", 404);
  if (
    [
      "membership_denied",
      "store_inactive",
      "feature_not_enabled",
      "durable_authority_invalid",
    ].includes(error.code)
  )
    return failure("forbidden", 403);
  if (
    ["version_conflict", "name_conflict", "operation_mismatch"].includes(
      error.code,
    )
  )
    return failure(error.code, 409);
  return failure("unavailable", 503);
}
async function body(request: Request): Promise<unknown> {
  if (request.headers.get("content-type") !== "application/json")
    throw new TypeError();
  const length = request.headers.get("content-length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > 131072))
    throw new TypeError();
  if (!request.body) throw new TypeError();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > 131072) {
        await reader.cancel();
        throw new TypeError();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}
function operationId(request: Request): string {
  const value = request.headers.get("idempotency-key");
  if (!value || !UUID.test(value)) throw new TypeError();
  return value;
}
function html(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
async function authorize(
  dependencies: Dependencies,
  request: Request,
  mutation: boolean,
  privileged = mutation,
): Promise<Response | Authorized> {
  if (PRIVATE_HEADERS.some((name) => request.headers.has(name)))
    return failure("invalid_input", 400);
  const cookie = readPersistentPanelSessionCookie(request);
  if (cookie.kind !== "present") return failure("unauthenticated", 401);
  let runtime: ServerBarcodeLabelRuntime | null;
  try {
    runtime = await dependencies.resolveRuntime();
  } catch {
    return failure("unavailable", 503);
  }
  if (!runtime) return failure("unavailable", 503);
  let now: Date, requestId: string;
  try {
    now = dependencies.now();
    requestId = dependencies.requestId();
  } catch {
    return failure("unavailable", 503);
  }
  if (
    !(now instanceof Date) ||
    !Number.isFinite(now.getTime()) ||
    !UUID.test(requestId)
  )
    return failure("unavailable", 503);
  let access: ServerPanelAccessResult;
  try {
    access = await runtime.access.resolveCredential({
      hostname: request.headers.get("host"),
      credential: cookie.credential,
      requestId,
      now: new Date(now),
    });
  } catch {
    return failure("unavailable", 503);
  }
  if (access.kind === "unauthenticated") return failure("unauthenticated", 401);
  if (access.kind === "unauthorized") return failure("forbidden", 403);
  if (access.kind !== "authenticated") return failure("unavailable", 503);
  if (
    mutation &&
    !approvedPanelMutationOriginForStore(
      request,
      runtime.access.panelOrigin,
      access.tenantContext.store.slug,
    )
  )
    return failure("origin_denied", 403);
  if (
    privileged &&
    !isMerchantActionAllowed(
      access.tenantContext.membership.role,
      "catalog_admin.manage",
    )
  )
    return failure("forbidden", 403);
  return Object.freeze({
    runtime,
    tenantContext: access.tenantContext,
    now: new Date(now),
  });
}
function queryInput(request: Request) {
  const url = new URL(request.url),
    allowed = new Set([
      "q",
      "status",
      "stockState",
      "categoryId",
      "brandId",
      "productId",
      "hasBarcode",
      "sort",
      "cursor",
      "pageSize",
    ]);
  for (const key of url.searchParams.keys())
    if (!allowed.has(key)) throw new TypeError();
  const value: Record<string, unknown> = {};
  for (const key of [
    "q",
    "status",
    "stockState",
    "categoryId",
    "brandId",
    "productId",
    "sort",
  ]) {
    const found = url.searchParams.get(key);
    if (found !== null) value[key] = found;
  }
  const has = url.searchParams.get("hasBarcode");
  if (has !== null) {
    if (has !== "true" && has !== "false") throw new TypeError();
    value.hasBarcode = has === "true";
  }
  const size = url.searchParams.get("pageSize");
  if (size !== null) value.pageSize = Number(size);
  return {
    query: parseBarcodeLabelListQuery(value),
    cursor: url.searchParams.get("cursor") ?? undefined,
  };
}

export function createBarcodeLabelHttpHandlers(dependencies: Dependencies) {
  const run = async <T>(
    action: () => Promise<T>,
    success: (value: T) => Response,
  ) => {
    try {
      return success(await action());
    } catch (error) {
      return repositoryFailure(error);
    }
  };
  return Object.freeze({
    async list(request: Request) {
      const authorized = await authorize(dependencies, request, false);
      if (authorized instanceof Response) return authorized;
      let parsed;
      try {
        parsed = queryInput(request);
      } catch {
        return failure("invalid_input", 400);
      }
      return run(
        () =>
          authorized.runtime.barcodeLabels.list({
            tenantContext: authorized.tenantContext,
            now: authorized.now,
            ...parsed,
          }),
        (value) => response(value),
      );
    },
    async templates(request: Request) {
      const mutation = request.method === "POST";
      if (request.method !== "GET" && !mutation)
        return failure("method_not_allowed", 405, { allow: "GET, POST" });
      const authorized = await authorize(dependencies, request, mutation);
      if (authorized instanceof Response) return authorized;
      const authority = {
        tenantContext: authorized.tenantContext,
        now: authorized.now,
      };
      if (!mutation)
        return run(
          () => authorized.runtime.barcodeLabels.listTemplates(authority),
          (items) => response({ items }),
        );
      try {
        const value = parseBarcodeLabelTemplateSaveIntent(await body(request));
        const operation = operationId(request);
        return run(
          () =>
            authorized.runtime.barcodeLabels.saveTemplate({
              ...authority,
              ...value,
              operationId: operation,
            }),
          (template) => response(template, 201),
        );
      } catch {
        return failure("invalid_input", 400);
      }
    },
    async template(request: Request, templateId: string) {
      if (request.method !== "PATCH")
        return failure("method_not_allowed", 405, { allow: "PATCH" });
      if (!UUID.test(templateId)) return failure("not_found", 404);
      const authorized = await authorize(dependencies, request, true);
      if (authorized instanceof Response) return authorized;
      try {
        const raw = await body(request);
        if (typeof raw !== "object" || raw === null || Array.isArray(raw))
          throw new TypeError();
        const value = parseBarcodeLabelTemplateSaveIntent({
          ...raw,
          templateId,
        });
        const operation = operationId(request);
        return run(
          () =>
            authorized.runtime.barcodeLabels.saveTemplate({
              tenantContext: authorized.tenantContext,
              now: authorized.now,
              ...value,
              operationId: operation,
            }),
          (template) => response(template),
        );
      } catch {
        return failure("invalid_input", 400);
      }
    },
    async archive(request: Request, templateId: string) {
      if (request.method !== "POST")
        return failure("method_not_allowed", 405, { allow: "POST" });
      if (!UUID.test(templateId)) return failure("not_found", 404);
      const authorized = await authorize(dependencies, request, true);
      if (authorized instanceof Response) return authorized;
      try {
        const value = (await body(request)) as Record<string, unknown>;
        if (
          !value ||
          Object.keys(value).join(",") !== "expectedVersion" ||
          !Number.isSafeInteger(value.expectedVersion) ||
          (value.expectedVersion as number) < 1
        )
          throw new TypeError();
        const operation = operationId(request);
        return run(
          () =>
            authorized.runtime.barcodeLabels.archiveTemplate({
              tenantContext: authorized.tenantContext,
              now: authorized.now,
              operationId: operation,
              templateId,
              expectedVersion: value.expectedVersion as number,
            }),
          (template) => response(template),
        );
      } catch {
        return failure("invalid_input", 400);
      }
    },
    async internal(request: Request) {
      if (request.method !== "POST")
        return failure("method_not_allowed", 405, { allow: "POST" });
      const authorized = await authorize(dependencies, request, true);
      if (authorized instanceof Response) return authorized;
      try {
        const value = parseBarcodeInternalCreateIntent(await body(request));
        const operation = operationId(request);
        return run(
          () =>
            authorized.runtime.barcodeLabels.generateInternal({
              tenantContext: authorized.tenantContext,
              now: authorized.now,
              operationId: operation,
              ...value,
            }),
          (result) => response(result),
        );
      } catch {
        return failure("invalid_input", 400);
      }
    },
    async jobs(request: Request) {
      const mutation = request.method === "POST";
      if (request.method !== "GET" && !mutation)
        return failure("method_not_allowed", 405, { allow: "GET, POST" });
      const authorized = await authorize(dependencies, request, mutation);
      if (authorized instanceof Response) return authorized;
      const authority = {
        tenantContext: authorized.tenantContext,
        now: authorized.now,
      };
      if (!mutation)
        return run(
          () => authorized.runtime.barcodeLabels.listJobs(authority),
          (items) => response({ items }),
        );
      try {
        const intent = parseBarcodePrintJobCreateIntent(await body(request));
        const operation = operationId(request);
        let templateName: string;
        if (intent.template.kind === "system") {
          const system = getSystemBarcodeLabelTemplate(intent.template.key);
          if (!system) throw new TypeError();
          templateName = system.name;
        } else {
          // SQL validates the store-bound template and canonicalizes its name.
          // Keeping this lookup out of HTTP also lets an idempotent replay
          // succeed after the source template is later renamed or archived.
          templateName = "Mağaza şablonu";
        }
        return run(
          () =>
            authorized.runtime.barcodeLabels.createJob({
              ...authority,
              ...intent,
              operationId: operation,
              templateName,
            }),
          (job) => response(job, 201),
        );
      } catch (error) {
        return repositoryFailure(
          error instanceof TypeError
            ? new BarcodeLabelRepositoryError("invalid_input")
            : error,
        );
      }
    },
    async job(request: Request, jobId: string) {
      if (request.method !== "GET")
        return failure("method_not_allowed", 405, { allow: "GET" });
      if (!UUID.test(jobId)) return failure("not_found", 404);
      const authorized = await authorize(dependencies, request, false);
      if (authorized instanceof Response) return authorized;
      return run(
        () =>
          authorized.runtime.barcodeLabels.getJob({
            tenantContext: authorized.tenantContext,
            now: authorized.now,
            jobId,
          }),
        (job) => response(job),
      );
    },
    async output(request: Request, jobId: string, kind: "pdf" | "zpl") {
      if (request.method !== "GET")
        return failure("method_not_allowed", 405, { allow: "GET" });
      if (!UUID.test(jobId)) return failure("not_found", 404);
      const authorized = await authorize(dependencies, request, false, true);
      if (authorized instanceof Response) return authorized;
      try {
        const job = await authorized.runtime.barcodeLabels.getJob({
          tenantContext: authorized.tenantContext,
          now: authorized.now,
          jobId,
        });
        if (job.outputType !== kind) return failure("not_found", 404);
        const document = buildLabelDocument({
          templateName: job.templateName,
          template: job.templateConfig,
          printerProfile: job.printerProfile,
          startCell: job.startCell,
          storeName: job.storeName,
          items: job.items.map((item) => ({
            row: item.snapshot,
            quantity: item.quantity,
          })),
        });
        if (document.errors.length > 0)
          return failure("label_document_blocked", 409);
        const safeName = `${authorized.tenantContext.store.slug}-${job.templateName
          .toLocaleLowerCase("tr-TR")
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")}-${job.createdAt.slice(0, 10)}`;
        if (kind === "pdf") {
          const bytes = await renderLabelPdf(document);
          return new Response(bytes as BodyInit, {
            status: 200,
            headers: {
              "content-type": "application/pdf",
              "content-disposition": `attachment; filename="${safeName}.pdf"`,
              "cache-control": "private, no-store",
              "x-content-type-options": "nosniff",
            },
          });
        }
        const dpi = job.printerProfile === "zebra-300" ? 300 : 203;
        return new Response(renderLabelZpl(document, dpi), {
          status: 200,
          headers: {
            "content-type": "application/zpl; charset=utf-8",
            "content-disposition": `attachment; filename="${safeName}-${dpi}dpi.zpl"`,
            "cache-control": "private, no-store",
            "x-content-type-options": "nosniff",
          },
        });
      } catch (error) {
        return repositoryFailure(error);
      }
    },
    async print(request: Request) {
      if (request.method !== "GET")
        return failure("method_not_allowed", 405, { allow: "GET" });
      const url = new URL(request.url),
        jobId = url.searchParams.get("jobId");
      if (
        [...url.searchParams.keys()].some((key) => key !== "jobId") ||
        !jobId ||
        !UUID.test(jobId)
      )
        return failure("not_found", 404);
      const authorized = await authorize(dependencies, request, false, true);
      if (authorized instanceof Response) return authorized;
      try {
        const job = await authorized.runtime.barcodeLabels.getJob({
          tenantContext: authorized.tenantContext,
          now: authorized.now,
          jobId,
        });
        if (job.outputType !== "browser") return failure("not_found", 404);
        const document = buildLabelDocument({
          templateName: job.templateName,
          template: job.templateConfig,
          printerProfile: job.printerProfile,
          startCell: job.startCell,
          storeName: job.storeName,
          items: job.items.map((item) => ({
            row: item.snapshot,
            quantity: item.quantity,
          })),
        });
        if (document.errors.length)
          return failure("label_document_blocked", 409);
        const renderedLabels = new Map(
          document.items.map((item) => {
            const label = `<article class="label" aria-label="${html(item.source.productTitle)}">${item.fields
              .map((field) =>
                field.key === "barcodeSymbol"
                  ? renderBarcodeSvg(
                      item.barcode.format,
                      item.barcode.value,
                      item.barcode.heightMm,
                      item.barcode.showHumanReadable,
                    )
                  : `<div style="font-size:${field.fontSizePt}pt;text-align:${field.align};overflow:hidden;display:-webkit-box;-webkit-line-clamp:${field.maxLines};-webkit-box-orient:vertical">${html(field.value)}</div>`,
              )
              .join("")}</article>`;
            return [item, label] as const;
          }),
        );
        const sheets = paginateLabelDocument(document)
          .map(
            (labelPage) =>
              `<main class="sheet">${labelPage
                .map((item) =>
                  item
                    ? renderedLabels.get(item)!
                    : '<article class="label blank" aria-hidden="true"></article>',
                )
                .join("")}</main>`,
          )
          .join("");
        const page = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>${html(job.templateName)}</title><style>@page{size:${document.template.paperType === "a4" ? `A4 ${document.template.orientation}` : `${document.template.widthMm}mm ${document.template.heightMm}mm`};margin:${document.template.paperType === "a4" ? "4mm" : "0"}}*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif;color:#111}.sheet{display:grid;grid-template-columns:repeat(${document.template.paperType === "a4" ? document.template.columns : 1},${document.template.widthMm}mm);grid-template-rows:repeat(${document.template.paperType === "a4" ? document.template.rows : 1},${document.template.heightMm}mm);gap:${document.template.gapMm.vertical}mm ${document.template.gapMm.horizontal}mm}.sheet:not(:last-child){break-after:page}.label{width:${document.template.widthMm}mm;height:${document.template.heightMm}mm;padding:${document.template.marginsMm.top}mm ${document.template.marginsMm.right}mm ${document.template.marginsMm.bottom}mm ${document.template.marginsMm.left}mm;overflow:hidden;break-inside:avoid;display:grid;align-content:center}.label svg{display:block;width:100%;max-height:${document.template.barcodeHeightMm + 5}mm}.controls{padding:12px;position:sticky;top:0;background:#fff;border-bottom:1px solid #ddd}.controls button{padding:9px 16px}@media print{.controls{display:none}}</style></head><body><div class="controls"><button type="button" onclick="window.print()">Yazdır</button></div>${sheets}</body></html>`;
        return new Response(page, {
          status: 200,
          headers: {
            "content-type": "text/html; charset=utf-8",
            "cache-control": "private, no-store",
            "content-security-policy":
              "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:",
            "x-content-type-options": "nosniff",
          },
        });
      } catch (error) {
        return repositoryFailure(error);
      }
    },
  });
}

export const barcodeLabelHttpHandlers = createBarcodeLabelHttpHandlers({
  resolveRuntime: resolveDefaultServerBarcodeLabelRuntime,
  now: () => new Date(),
  requestId: randomUUID,
});
