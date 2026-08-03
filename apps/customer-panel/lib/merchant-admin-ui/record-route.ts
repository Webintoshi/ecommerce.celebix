import type { MerchantAdminRecordKind } from "@celebix/saas-contracts";

export interface MerchantRecordRouteDefinition {
  readonly createPath?: string;
  readonly kind: MerchantAdminRecordKind;
  readonly returnTo: string;
}

const ROUTES = Object.freeze({
  discount: Object.freeze({ kind: "discount", returnTo: "/discounts", createPath: "/discounts/new" }),
  "lucky-wheel": Object.freeze({ kind: "lucky_wheel", returnTo: "/discounts/lucky-wheel", createPath: "/discounts/lucky-wheel/new" }),
  "marketing-email": Object.freeze({ kind: "email_campaign", returnTo: "/marketing/email", createPath: "/marketing/email/new" }),
  "marketing-phone": Object.freeze({ kind: "phone_campaign", returnTo: "/marketing/phone", createPath: "/marketing/phone/new" }),
  "marketing-whatsapp": Object.freeze({ kind: "whatsapp_campaign", returnTo: "/marketing/whatsapp", createPath: "/marketing/whatsapp/new" }),
  "content-blog": Object.freeze({ kind: "blog_post", returnTo: "/content/blog", createPath: "/content/blog/new" }),
  "content-pages": Object.freeze({ kind: "page", returnTo: "/content/pages", createPath: "/content/pages/new" }),
  payment: Object.freeze({ kind: "payment_setting", returnTo: "/settings/payment", createPath: "/settings/payment/new" }),
} as const satisfies Readonly<Record<string, MerchantRecordRouteDefinition>>);

export function getMerchantRecordRouteDefinition(routeKey: string): MerchantRecordRouteDefinition {
  if (!Object.hasOwn(ROUTES, routeKey)) throw new TypeError("merchant_record_route_invalid");
  const result = ROUTES[routeKey as keyof typeof ROUTES];
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
