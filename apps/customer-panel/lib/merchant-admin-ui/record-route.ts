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
  "content-policies": Object.freeze({ kind: "policy", returnTo: "/content/policies", createPath: "/content/policies/new" }),
  marketplaces: Object.freeze({ kind: "marketplace_connection", returnTo: "/marketplaces", createPath: "/marketplaces/new" }),
  "settings-administrators": Object.freeze({ kind: "administrator_invite", returnTo: "/settings/administrators", createPath: "/settings/administrators/new" }),
  "accounting-invoicing": Object.freeze({ kind: "invoice_integration", returnTo: "/accounting/invoicing-integration", createPath: "/accounting/invoicing-integration/new" }),
  "seo-code-integrations": Object.freeze({ kind: "code_integration", returnTo: "/seo/code-integrations", createPath: "/seo/code-integrations/new" }),
  "seo-fast-indexing": Object.freeze({ kind: "indexing_request", returnTo: "/seo/fast-indexing", createPath: "/seo/fast-indexing/new" }),
  "seo-geo-optimization": Object.freeze({ kind: "seo_geo_profile", returnTo: "/seo/geo-optimization", createPath: "/seo/geo-optimization/new" }),
  "seo-internal-linking": Object.freeze({ kind: "seo_internal_link", returnTo: "/seo/internal-linking", createPath: "/seo/internal-linking/new" }),
  "seo-content": Object.freeze({ kind: "seo_content_entry", returnTo: "/seo/content", createPath: "/seo/content/new" }),
  "seo-categories": Object.freeze({ kind: "seo_category_entry", returnTo: "/seo/categories", createPath: "/seo/categories/new" }),
  "seo-pages": Object.freeze({ kind: "seo_page_entry", returnTo: "/seo/pages", createPath: "/seo/pages/new" }),
  "seo-products": Object.freeze({ kind: "seo_product_entry", returnTo: "/seo/products", createPath: "/seo/products/new" }),
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
