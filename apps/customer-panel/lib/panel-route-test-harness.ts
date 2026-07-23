import {
  isMerchantActionAllowed,
  type MerchantAction,
  type StoreMembershipRole,
  type TenantContext,
} from "@celebix/saas-contracts";

import type { ServerPanelAccessResult } from "./server-panel-access/access.ts";
import { decideServerPanelAccess } from "./server-panel-access/decision-policy.ts";

const TARGETS = Object.freeze({
  "/products/tags": "catalog_admin.manage",
  "/products/barcode-labels": "catalog_admin.read",
} satisfies Record<string, MerchantAction>);
const ACCESS = new WeakMap<Request, ServerPanelAccessResult>();
const ORIGIN = "https://panel.celebix.site";

function request(path: string, access: ServerPanelAccessResult): Request {
  const result = new Request(new URL(path, ORIGIN));
  ACCESS.set(result, access);
  return result;
}

function tenantContext(role: StoreMembershipRole): TenantContext {
  return Object.freeze({
    schemaVersion: 1,
    requestId: "route-test-request",
    principal: Object.freeze({
      id: "10000000-0000-4000-8000-000000000001",
      issuer: "https://issuer.test/oidc",
      subject: "route-test",
    }),
    store: Object.freeze({
      id: "20000000-0000-4000-8000-000000000001",
      name: "Route Test",
      slug: "route-test",
      status: "active",
      locale: "tr",
      currency: "TRY",
      themeKey: "default",
    }),
    membership: Object.freeze({
      id: "30000000-0000-4000-8000-000000000001",
      principalId: "10000000-0000-4000-8000-000000000001",
      storeId: "20000000-0000-4000-8000-000000000001",
      role,
      status: "active",
    }),
    entitlements: Object.freeze({
      schemaVersion: 1,
      planId: "40000000-0000-4000-8000-000000000001",
      planCode: "free_starter",
      version: 1,
      status: "active",
      features: Object.freeze(["catalog"] as const),
      limits: Object.freeze({ products: 100, staff: 5, storageBytes: 1024 }),
      validFrom: "2026-07-22T00:00:00.000Z",
    }),
    locale: "tr",
  });
}

export function signedOutRequest(path: string): Request {
  return request(path, Object.freeze({ kind: "unauthenticated" }));
}

export function signedInRequest(
  path: string,
  role: StoreMembershipRole,
): Request {
  const context = tenantContext(role);
  return request(
    path,
    Object.freeze({
      kind: "authenticated",
      session: Object.freeze({
        id: "50000000-0000-4000-8000-000000000001",
        principal: context.principal,
        activeStoreId: context.store.id,
        createdAt: "2026-07-22T17:00:00.000Z",
        rotatedAt: "2026-07-22T17:30:00.000Z",
        expiresAt: "2026-07-23T01:00:00.000Z",
      }),
      tenantContext: context,
    }),
  );
}

export async function renderPanelRoute(
  path: keyof typeof TARGETS,
  panelRequest: Request,
): Promise<Response> {
  const url = new URL(panelRequest.url);
  if (
    url.origin !== ORIGIN ||
    url.pathname !== path ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    return new Response(null, { status: 404 });
  }
  const access = ACCESS.get(panelRequest);
  if (access === undefined) return new Response(null, { status: 401 });
  const decision = decideServerPanelAccess(access);
  if (decision.kind === "redirect") {
    return new Response(null, {
      status: 303,
      headers: { location: decision.destination },
    });
  }
  const action = TARGETS[path];
  return Response.json(
    {
      action,
      allowed: isMerchantActionAllowed(
        decision.tenantContext.membership.role,
        action,
      ),
    },
    { status: 200 },
  );
}
