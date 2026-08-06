import {
  parseShippingConnection,
  parseShipment,
  parseShippingQuoteSession,
  parseShippingResource,
  type Shipment,
  type ShippingConnection,
  type ShippingQuoteSession,
  type ShippingResource,
} from "@celebix/saas-contracts";
import {
  SHIPPING_ADMIN_ERROR_CODES,
  ShippingAdminRepositoryError,
  type ShippingAdminErrorCode,
} from "@celebix/saas-data";

import {
  authorizeShippingRequest,
  isShippingHttpFailure,
  type ShippingHttpAuthority,
  type ShippingHttpDependencies,
  type ShippingHttpFailure,
} from "./request-authority.ts";
import {
  parseBeginQuoteBody,
  parseBeginShipmentBody,
  parseRevokeConnectionBody,
  parseSaveConnectionBody,
  parseSelectResourcesBody,
  parseShipmentActionBody,
  readShippingJsonBody,
} from "./request-input.ts";
import type { ShippingShipmentActionKind } from "@celebix/saas-data";

const BASE = "/api/settings/shipping/connection";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const STATUS: Readonly<Record<ShippingAdminErrorCode, number>> = Object.freeze({
  invalid_input: 400, membership_denied: 403, store_inactive: 403, feature_not_enabled: 403,
  durable_authority_invalid: 409, version_conflict: 409, operation_mismatch: 409,
  not_found: 404, resource_invalid: 409, already_revoked: 409,
  order_not_found: 404, order_version_mismatch: 409, order_not_fulfillable: 409,
  currency_unsupported: 409, provider_not_ready: 409, quote_not_found: 404,
  quote_expired: 409, quote_not_ready: 409, option_invalid: 409, shipment_exists: 409,
  operation_not_found: 404, commit_unknown: 503, unavailable: 503,
});

type Workspace = Readonly<{ connection: ShippingConnection | null; resources: readonly ShippingResource[] }>;

function json(value: unknown, status = 200, extra?: HeadersInit): Response {
  const headers = new Headers(extra);
  headers.set("cache-control", "no-store");
  headers.set("x-content-type-options", "nosniff");
  return Response.json(value, { status, headers });
}

function labelResponse(value: Readonly<{ bytes: Uint8Array; sha256: string; version: number }>): Response {
  const body = new Uint8Array(value.bytes.byteLength);
  body.set(value.bytes);
  return new Response(body.buffer, { status: 200, headers: {
    "cache-control": "private, no-store", "content-type": "image/svg+xml", "content-disposition": "inline; filename=celebix-kargo-etiketi.svg",
    "content-security-policy": "sandbox; default-src 'none'; style-src 'unsafe-inline'", "x-content-type-options": "nosniff",
    etag: `\"sha256-${value.sha256}\"`, "x-celebix-label-version": String(value.version),
  } });
}

function failure(value: ShippingHttpFailure): Response {
  return json({ code: value.code }, value.status, value.allow ? { allow: value.allow } : undefined);
}

function mappedFailure(error: unknown): Response {
  if (error instanceof ShippingAdminRepositoryError && SHIPPING_ADMIN_ERROR_CODES.includes(error.code)) return json({ code: error.code }, STATUS[error.code]);
  return json({ code: "unavailable" }, 503);
}

function safeWorkspace(value: Readonly<{ connection: unknown; resources: unknown }>): Workspace {
  if (!Array.isArray(value.resources) || value.resources.length > 300) throw new ShippingAdminRepositoryError("unavailable");
  try {
    const connection = value.connection === null ? null : parseShippingConnection(value.connection);
    const resources = Object.freeze(value.resources.map((entry) => parseShippingResource(entry)));
    if (new Set(resources.map(({ id }) => id)).size !== resources.length) throw new Error("duplicate");
    return Object.freeze({ connection, resources });
  } catch { throw new ShippingAdminRepositoryError("unavailable"); }
}

function safeQuote(value: unknown): ShippingQuoteSession {
  try { return parseShippingQuoteSession(value); } catch { throw new ShippingAdminRepositoryError("unavailable"); }
}

function safeShipment(value: unknown): Shipment {
  try { return parseShipment(value); } catch { throw new ShippingAdminRepositoryError("unavailable"); }
}

async function current(authority: ShippingHttpAuthority): Promise<Workspace> {
  const setup = await authority.runtime.admin.setup({ tenantContext: authority.tenantContext, now: authority.now, providerCode: "basit_kargo" });
  return setup === null ? Object.freeze({ connection: null, resources: Object.freeze([]) }) : safeWorkspace(setup);
}

export function createShippingHttpHandlers(dependencies: ShippingHttpDependencies) {
  return Object.freeze({
    async connection(request: Request): Promise<Response> {
      if (request.method === "GET") {
        const authority = await authorizeShippingRequest(dependencies, request, "GET", BASE);
        if (isShippingHttpFailure(authority)) return failure(authority);
        try { return json(await current(authority)); } catch (error) { return mappedFailure(error); }
      }
      const authority = await authorizeShippingRequest(dependencies, request, "POST", BASE);
      if (isShippingHttpFailure(authority)) return failure(authority);
      const parsed = parseSaveConnectionBody(await readShippingJsonBody(request));
      if (parsed === null) return json({ code: "invalid_input" }, 400);
      try {
        const saved = await authority.runtime.admin.saveConnection({
          tenantContext: authority.tenantContext, now: authority.now, providerCode: "basit_kargo",
          operationId: parsed.operationId, token: parsed.token,
        });
        try {
          await dependencies.validateJob({
            jobId: saved.validationJobId, workerId: `panel.${authority.requestId}`,
            runtime: authority.runtime, now: authority.now,
          });
        } catch {
          return json(safeWorkspace({ connection: saved.connection, resources: [] }), 202);
        }
        const workspace = await current(authority);
        return json(workspace, workspace.connection?.status === "pending" ? 202 : 200);
      } catch (error) { return mappedFailure(error); }
    },

    async resources(request: Request): Promise<Response> {
      const authority = await authorizeShippingRequest(dependencies, request, "PATCH", `${BASE}/resources`);
      if (isShippingHttpFailure(authority)) return failure(authority);
      const parsed = parseSelectResourcesBody(await readShippingJsonBody(request));
      if (parsed === null) return json({ code: "invalid_input" }, 400);
      try {
        const connection = await authority.runtime.admin.selectResources({
          tenantContext: authority.tenantContext, now: authority.now, providerCode: "basit_kargo", ...parsed,
        });
        const setup = await current(authority);
        return json(safeWorkspace({ connection, resources: setup.resources }));
      } catch (error) { return mappedFailure(error); }
    },

    async revoke(request: Request): Promise<Response> {
      const authority = await authorizeShippingRequest(dependencies, request, "DELETE", `${BASE}/revoke`);
      if (isShippingHttpFailure(authority)) return failure(authority);
      const parsed = parseRevokeConnectionBody(await readShippingJsonBody(request));
      if (parsed === null) return json({ code: "invalid_input" }, 400);
      try {
        const connection = await authority.runtime.admin.revokeConnection({
          tenantContext: authority.tenantContext, now: authority.now, providerCode: "basit_kargo", operationId: parsed.operationId,
        });
        return json(safeWorkspace({ connection, resources: [] }));
      } catch (error) { return mappedFailure(error); }
    },

    async quote(request: Request, orderId: string): Promise<Response> {
      if (!UUID.test(orderId)) return json({ code: "invalid_input" }, 400);
      const pathname = `/api/orders/${orderId}/shipping/quotes`;
      const authority = await authorizeShippingRequest(dependencies, request, "POST", pathname);
      if (isShippingHttpFailure(authority)) return failure(authority);
      const parsed = parseBeginQuoteBody(await readShippingJsonBody(request));
      if (parsed === null) return json({ code: "invalid_input" }, 400);
      try {
        const pending = await authority.runtime.admin.beginQuote({
          tenantContext: authority.tenantContext, now: authority.now, orderId, ...parsed,
        });
        await dependencies.fulfillJob({
          jobId: pending.jobId, workerId: `panel.${authority.requestId}`,
          runtime: authority.runtime, now: authority.now,
        });
        const quote = await authority.runtime.admin.currentQuote({
          tenantContext: authority.tenantContext, now: authority.now, credential: pending.credential,
        });
        if (quote === null) throw new ShippingAdminRepositoryError("unavailable");
        return json({ quote: safeQuote(quote) });
      } catch (error) { return mappedFailure(error); }
    },

    async shipment(request: Request, orderId: string): Promise<Response> {
      if (!UUID.test(orderId)) return json({ code: "invalid_input" }, 400);
      const pathname = `/api/orders/${orderId}/shipping/shipments`;
      const authority = await authorizeShippingRequest(dependencies, request, "POST", pathname);
      if (isShippingHttpFailure(authority)) return failure(authority);
      const parsed = parseBeginShipmentBody(await readShippingJsonBody(request));
      if (parsed === null) return json({ code: "invalid_input" }, 400);
      try {
        const pending = await authority.runtime.admin.beginShipment({
          tenantContext: authority.tenantContext, now: authority.now, orderId, ...parsed,
        });
        await dependencies.fulfillJob({
          jobId: pending.jobId, workerId: `panel.${authority.requestId}`,
          runtime: authority.runtime, now: authority.now,
        });
        const shipment = await authority.runtime.admin.currentShipment({
          tenantContext: authority.tenantContext, now: authority.now, shipmentId: pending.shipment.id,
        });
        if (shipment === null) throw new ShippingAdminRepositoryError("unavailable");
        const safe = safeShipment(shipment);
        return json({ shipment: safe }, safe.status === "ready" ? 201 : 202);
      } catch (error) { return mappedFailure(error); }
    },

    async shipmentForOrder(request: Request, orderId: string): Promise<Response> {
      if (!UUID.test(orderId)) return json({ code: "invalid_input" }, 400);
      const pathname = `/api/orders/${orderId}/shipping/shipments`;
      const authority = await authorizeShippingRequest(dependencies, request, "GET", pathname);
      if (isShippingHttpFailure(authority)) return failure(authority);
      try {
        const shipment = await authority.runtime.admin.currentShipmentForOrder({
          tenantContext: authority.tenantContext, now: authority.now, orderId,
        });
        return json({ shipment: shipment === null ? null : safeShipment(shipment) });
      } catch (error) { return mappedFailure(error); }
    },

    async shipmentDetail(request: Request, orderId: string, shipmentId: string): Promise<Response> {
      if (!UUID.test(orderId) || !UUID.test(shipmentId)) return json({ code: "invalid_input" }, 400);
      const pathname = `/api/orders/${orderId}/shipping/shipments/${shipmentId}`;
      const authority = await authorizeShippingRequest(dependencies, request, "GET", pathname);
      if (isShippingHttpFailure(authority)) return failure(authority);
      try {
        const shipment = await authority.runtime.admin.currentShipment({
          tenantContext: authority.tenantContext, now: authority.now, shipmentId,
        });
        if (shipment === null) return json({ code: "not_found" }, 404);
        return json({ shipment: safeShipment(shipment) });
      } catch (error) { return mappedFailure(error); }
    },

    async shipmentAction(request: Request, orderId: string, shipmentId: string, actionKind: Exclude<ShippingShipmentActionKind, "label">): Promise<Response> {
      if (!UUID.test(orderId) || !UUID.test(shipmentId)) return json({ code: "invalid_input" }, 400);
      const pathname = `/api/orders/${orderId}/shipping/shipments/${shipmentId}/${actionKind}`;
      const authority = await authorizeShippingRequest(dependencies, request, "POST", pathname);
      if (isShippingHttpFailure(authority)) return failure(authority);
      const parsed = parseShipmentActionBody(await readShippingJsonBody(request));
      if (parsed === null) return json({ code: "invalid_input" }, 400);
      try {
        const pending = await authority.runtime.admin.beginShipmentAction({
          tenantContext: authority.tenantContext, now: authority.now, orderId, shipmentId, actionKind, ...parsed,
        });
        const outcome = await dependencies.shipmentActionJob({
          jobId: pending.jobId, workerId: `panel.${authority.requestId}`, runtime: authority.runtime, now: authority.now,
        });
        if (outcome === "failed" || outcome === "empty") return json({ code: "unavailable" }, 503);
        const shipment = await authority.runtime.admin.currentShipment({
          tenantContext: authority.tenantContext, now: authority.now, shipmentId,
        });
        if (shipment === null) return json({ code: "not_found" }, 404);
        return json({ shipment: safeShipment(shipment) }, outcome === "marked_unknown" ? 202 : 200);
      } catch (error) { return mappedFailure(error); }
    },

    async shipmentLabel(request: Request, orderId: string, shipmentId: string): Promise<Response> {
      if (!UUID.test(orderId) || !UUID.test(shipmentId)) return json({ code: "invalid_input" }, 400);
      const pathname = `/api/orders/${orderId}/shipping/shipments/${shipmentId}/label`;
      if (request.method === "GET") {
        const authority = await authorizeShippingRequest(dependencies, request, "GET", pathname);
        if (isShippingHttpFailure(authority)) return failure(authority);
        try {
          const label = await authority.runtime.admin.currentShipmentLabel({ tenantContext: authority.tenantContext, now: authority.now, orderId, shipmentId });
          return label === null ? json({ code: "not_found" }, 404) : labelResponse(label);
        } catch (error) { return mappedFailure(error); }
      }
      const authority = await authorizeShippingRequest(dependencies, request, "POST", pathname);
      if (isShippingHttpFailure(authority)) return failure(authority);
      const parsed = parseShipmentActionBody(await readShippingJsonBody(request));
      if (parsed === null) return json({ code: "invalid_input" }, 400);
      try {
        const pending = await authority.runtime.admin.beginShipmentAction({
          tenantContext: authority.tenantContext, now: authority.now, orderId, shipmentId, actionKind: "label", ...parsed,
        });
        const outcome = await dependencies.shipmentActionJob({
          jobId: pending.jobId, workerId: `panel.${authority.requestId}`, runtime: authority.runtime, now: authority.now,
        });
        if (outcome !== "completed") return json({ code: "unavailable" }, 503);
        const shipment = await authority.runtime.admin.currentShipment({ tenantContext: authority.tenantContext, now: authority.now, shipmentId });
        if (shipment === null) return json({ code: "not_found" }, 404);
        return json({ shipment: safeShipment(shipment) });
      } catch (error) { return mappedFailure(error); }
    },
  });
}
