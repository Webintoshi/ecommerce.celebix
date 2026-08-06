import {
  parseShippingConnection,
  parseShippingResource,
  type ShippingConnection,
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
  parseRevokeConnectionBody,
  parseSaveConnectionBody,
  parseSelectResourcesBody,
  readShippingJsonBody,
} from "./request-input.ts";

const BASE = "/api/settings/shipping/connection";
const STATUS: Readonly<Record<ShippingAdminErrorCode, number>> = Object.freeze({
  invalid_input: 400, membership_denied: 403, store_inactive: 403, feature_not_enabled: 403,
  durable_authority_invalid: 409, version_conflict: 409, operation_mismatch: 409,
  not_found: 404, resource_invalid: 409, already_revoked: 409, commit_unknown: 503, unavailable: 503,
});

type Workspace = Readonly<{ connection: ShippingConnection | null; resources: readonly ShippingResource[] }>;

function json(value: unknown, status = 200, extra?: HeadersInit): Response {
  const headers = new Headers(extra);
  headers.set("cache-control", "no-store");
  headers.set("x-content-type-options", "nosniff");
  return Response.json(value, { status, headers });
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
  });
}
