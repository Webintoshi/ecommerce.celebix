import { GET as fallbackGET } from "../../[...slug]/route";
import { ORDER_ADJACENT_CART_ID, ORDER_ADJACENT_DRAFT_ID } from "../../../mira-order-adjacent/order-adjacent-data";

const NOW = "2026-09-09T12:00:00.000Z";
const PRODUCT_ID = "93000000-0000-4000-8000-000000000001";
const VARIANT_ID = "94000000-0000-4000-8000-000000000001";
const LINE_ID = "95000000-0000-4000-8000-000000000001";
const CUSTOMER_ID = "81000000-0000-4000-8000-000000000001";
const QUICK_LINK_ID = "96000000-0000-4000-8000-000000000001";
const PAYMENT_METHOD_ID = "97000000-0000-4000-8000-000000000001";

const DRAFT = Object.freeze({
  id: ORDER_ADJACENT_DRAFT_ID,
  draftNumber: "TSL-MIRA-0001",
  status: "draft",
  customerId: CUSTOMER_ID,
  customerName: "Ada QA",
  customerEmail: "ada@example.test",
  customerPhone: "+905551112233",
  currency: "TRY",
  totalCents: 25_500,
  lineCount: 1,
  adjustInventory: true,
  createdAt: NOW,
  updatedAt: NOW,
  version: 2,
  subtotalCents: 24_000,
  shippingCents: 1_500,
  discountCents: 0,
  shippingAddress: Object.freeze({ recipientName: "Ada QA", line1: "İstiklal Caddesi 42", district: "Beyoğlu", city: "İstanbul", postalCode: "34430", country: "TR" }),
  billingAddress: Object.freeze({ recipientName: "Ada QA", line1: "İstiklal Caddesi 42", district: "Beyoğlu", city: "İstanbul", postalCode: "34430", country: "TR" }),
  note: "Yerel kabul testi taslağı",
  lines: Object.freeze([Object.freeze({
    lineId: LINE_ID,
    position: 0,
    productId: PRODUCT_ID,
    variantId: VARIANT_ID,
    productName: "Keten Gömlek",
    variantName: "M / Krem",
    sku: "KG-M-KREM",
    unitPriceCents: 24_000,
    quantity: 1,
    discountCents: 0,
    lineTotalCents: 24_000,
  })]),
});

const DRAFT_LIST_ITEM = Object.freeze({
  id: DRAFT.id,
  draftNumber: DRAFT.draftNumber,
  status: DRAFT.status,
  customerName: DRAFT.customerName,
  customerEmail: DRAFT.customerEmail,
  currency: DRAFT.currency,
  totalCents: DRAFT.totalCents,
  lineCount: DRAFT.lineCount,
  adjustInventory: DRAFT.adjustInventory,
  createdAt: DRAFT.createdAt,
  updatedAt: DRAFT.updatedAt,
  version: DRAFT.version,
});

const QUICK_LINK = Object.freeze({
  id: QUICK_LINK_ID,
  customerName: "Deniz QA",
  customerEmail: "deniz@example.test",
  firstProductName: "Keten Gömlek",
  itemCount: 1,
  status: "active",
  currency: "TRY",
  totalCents: 24_000,
  expiresAt: "2026-09-10T12:00:00.000Z",
  createdAt: NOW,
  version: 1,
});

const CART_ITEM = Object.freeze({
  id: LINE_ID,
  position: 0,
  productName: "Keten Gömlek",
  variantName: "M / Krem",
  sku: "KG-M-KREM",
  unitPriceCents: 24_000,
  quantity: 1,
  discountCents: 0,
  lineTotalCents: 24_000,
});

const CART = Object.freeze({
  id: ORDER_ADJACENT_CART_ID,
  status: "abandoned",
  customerId: CUSTOMER_ID,
  customerName: "Ada QA",
  customerEmail: "ada@example.test",
  customerPhone: "+905551112233",
  currency: "TRY",
  subtotalCents: 24_000,
  discountCents: 0,
  totalCents: 24_000,
  itemCount: 1,
  firstProductName: "Keten Gömlek",
  checkoutStartedAt: "2026-09-09T10:00:00.000Z",
  lastActivityAt: NOW,
  abandonedAt: "2026-09-09T11:00:00.000Z",
  version: 3,
  createdAt: "2026-09-09T10:00:00.000Z",
  updatedAt: NOW,
  items: Object.freeze([CART_ITEM]),
});

const CART_LIST_ITEM = Object.freeze({
  id: CART.id,
  status: CART.status,
  customerId: CART.customerId,
  customerName: CART.customerName,
  customerEmail: CART.customerEmail,
  customerPhone: CART.customerPhone,
  currency: CART.currency,
  subtotalCents: CART.subtotalCents,
  discountCents: CART.discountCents,
  totalCents: CART.totalCents,
  itemCount: CART.itemCount,
  firstProductName: CART.firstProductName,
  checkoutStartedAt: CART.checkoutStartedAt,
  lastActivityAt: CART.lastActivityAt,
  abandonedAt: CART.abandonedAt,
  version: CART.version,
  createdAt: CART.createdAt,
  updatedAt: CART.updatedAt,
});

function pathOf(context: { params: Promise<{ path?: string[] }> }) {
  return context.params.then(({ path }) => path?.join("/") ?? "");
}

function fallbackContext(path: string) {
  return { params: Promise.resolve({ slug: ["orders", ...path.split("/").filter(Boolean)] }) };
}

function requestedState(request: Request): "loaded" | "empty" | "error" | null {
  const source = request.headers.get("referer");
  if (!source) return null;
  let url: URL;
  try { url = new URL(source); }
  catch { return null; }
  if (!/^\/mira-order-adjacent(?:\/|$)/.test(url.pathname)) return null;
  const state = url.searchParams.get("state");
  return state === "empty" || state === "error" ? state : "loaded";
}

function unavailable() {
  return Response.json({ code: "unavailable" }, { status: 503 });
}

function invalid() {
  return Response.json({ code: "invalid_input" }, { status: 400 });
}

export async function GET(request: Request, context: { params: Promise<{ path?: string[] }> }) {
  const path = await pathOf(context);
  const state = requestedState(request);
  if (state === null) return fallbackGET(request, fallbackContext(path));
  const query = new URL(request.url).searchParams;
  const scoped = path === "drafts" || path === `drafts/${ORDER_ADJACENT_DRAFT_ID}` || path === "quick-links" || path === "quick-links/payment-methods" || path === "abandoned-carts" || path === "abandoned-carts/summary" || path === `abandoned-carts/${ORDER_ADJACENT_CART_ID}`;
  if (scoped && state === "error") return unavailable();
  if (path === "drafts") {
    if (query.get("pageSize") !== "25" || query.size !== 1) return invalid();
    return Response.json({ items: state === "empty" ? [] : [DRAFT_LIST_ITEM] });
  }
  if (path === `drafts/${ORDER_ADJACENT_DRAFT_ID}`) return Response.json(DRAFT);
  if (path === "quick-links/payment-methods") return Response.json({ items: [{ id: PAYMENT_METHOD_ID, label: "Kart ile ödeme", requiresIdentity: false, requiresItemType: false }] });
  if (path === "quick-links") {
    if (query.get("pageSize") !== "20" || query.size !== 1) return invalid();
    return Response.json({ items: state === "empty" ? [] : [QUICK_LINK] });
  }
  if (path === "abandoned-carts/summary") return Response.json({ abandoned: state === "empty" ? 0 : 1, recovered: 2, lostValueCents: state === "empty" ? 0 : 24_000, recoveredValueCents: 48_000, currency: "TRY", asOf: NOW });
  if (path === "abandoned-carts") {
    if (query.get("pageSize") !== "20" || !["newest", "oldest", "highest", "lowest"].includes(query.get("sort") ?? "") || query.has("cursor")) return invalid();
    const search = query.get("search")?.toLocaleLowerCase("tr-TR");
    const status = query.get("status");
    const matches = state !== "empty" && (!search || `${CART.customerName} ${CART.customerEmail} ${CART.customerPhone} ${CART.firstProductName}`.toLocaleLowerCase("tr-TR").includes(search)) && (!status || status === CART.status);
    return Response.json({ items: matches ? [CART_LIST_ITEM] : [] });
  }
  if (path === `abandoned-carts/${ORDER_ADJACENT_CART_ID}`) return Response.json(CART);
  return fallbackGET(request, fallbackContext(path));
}

export async function POST(request: Request, context: { params: Promise<{ path?: string[] }> }) {
  if (requestedState(request) === null) {
    return Response.json({ code: "method_not_allowed" }, { status: 405, headers: { allow: "GET, PATCH" } });
  }
  const path = await pathOf(context);
  if (path === "drafts" || path.startsWith("drafts/") || path === "quick-links" || path.startsWith("quick-links/") || path.startsWith("abandoned-carts/")) {
    return Response.json({ code: "version_conflict" }, { status: 409 });
  }
  return invalid();
}
