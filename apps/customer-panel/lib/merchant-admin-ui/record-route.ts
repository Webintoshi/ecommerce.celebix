import type { MerchantAdminRecordKind } from "@celebix/saas-contracts";

export interface MerchantRecordRouteDefinition {
  readonly createPath?: string;
  readonly kind: MerchantAdminRecordKind;
  readonly returnTo: string;
}

const ROUTES = Object.freeze({
  discount: Object.freeze({ kind: "discount", returnTo: "/discounts", createPath: "/discounts/new" }),
  "content-blog": Object.freeze({ kind: "blog_post", returnTo: "/content/blog", createPath: "/content/blog/new" }),
  "content-pages": Object.freeze({ kind: "page", returnTo: "/content/pages", createPath: "/content/pages/new" }),
  "content-policies": Object.freeze({ kind: "policy", returnTo: "/content/policies", createPath: "/content/policies/new" }),
  payment: Object.freeze({ kind: "payment_setting", returnTo: "/settings/payment", createPath: "/settings/payment/new" }),
} as const satisfies Readonly<Record<string, MerchantRecordRouteDefinition>>);

export function getMerchantRecordRouteDefinition(routeKey: string): MerchantRecordRouteDefinition {
  const result = ROUTES[routeKey as keyof typeof ROUTES];
  if (!result) throw new TypeError("merchant_record_route_invalid");
  return result;
}

export function getMerchantRecordRouteDefinitionForKind(kind: MerchantAdminRecordKind) {
  return Object.values(ROUTES).find((route) => route.kind === kind);
}

export function createRouteFor(kind: MerchantAdminRecordKind) {
  const route = getMerchantRecordRouteDefinitionForKind(kind);
  return route && "createPath" in route ? route.createPath : undefined;
}

export function editRouteFor(kind: MerchantAdminRecordKind, recordId: string) {
  const route = getMerchantRecordRouteDefinitionForKind(kind);
  return route ? `${route.returnTo}/${encodeURIComponent(recordId)}/edit` : undefined;
}
