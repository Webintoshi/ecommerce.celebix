import { CATALOG_PRODUCT_STOCK_FILTERS, ORDER_STATUSES, PRODUCT_STATUSES, isMerchantActionAllowed, type MerchantAction, type TenantContext, type ToshiSource } from "@celebix/saas-contracts";
import type { AnalyticsRepository, CatalogRepository, CustomerRepository, InventoryRepository, OrderRepository, PromotionRepository } from "@celebix/saas-data";
import { zonedCivilDayStartToIso } from "../promotion-ui/model.ts";
import { findPanelHelp } from "./knowledge.ts";
import { entityId, exactRecord, optionalText, safeText, selection } from "./validation.ts";

export type ToshiToolRepositories = Readonly<{
  catalog?: Pick<CatalogRepository, "getDashboardSummary" | "listProducts" | "getProductDetails" | "listVariantChoices">;
  orders?: Pick<OrderRepository, "getDashboardSummary" | "listOrders" | "getOrder">;
  customers?: Pick<CustomerRepository, "getSummary" | "list">;
  promotions?: Pick<PromotionRepository, "list">;
  analytics?: Pick<AnalyticsRepository, "commerceTimezone" | "commerceSnapshot">;
  inventory?: Pick<InventoryRepository, "listLocations" | "listBalances">;
}>;
type Definition = Readonly<{ name: string; description: string; parameters: Readonly<Record<string, unknown>> }>;
export type ToshiToolResult = Readonly<{ result: unknown; sources: readonly ToshiSource[] }>;
const nullableString = { type: ["string", "null"] };
const schema = (properties: Record<string, unknown>) => ({ type: "object", properties, required: Object.keys(properties), additionalProperties: false });
const enumeration = (values: readonly string[]) => ({ type: ["string", "null"], enum: [...values, null] });
const source = (label: string, href: string): ToshiSource => ({ label: safeText(label, 80).trim() || "Kayıt", href });
const DAY = 86400000;

const DEFINITIONS = Object.freeze([
  { name: "store_summary", action: null, description: "Mağazanın yetkili katalog, sipariş ve müşteri özetini okur. Sıfır stok ile düşük stok farklıdır; ciro para birimiyle gelir.", parameters: schema({}) },
  { name: "products_search", action: "catalog_admin.read", description: "Ürün adı, SKU veya barkodla gerçek katalog araması. İlk 10 ürün ve varsa devam bilgisi. Satış fiyatı effective olabilir; null dinamik fiyatın şu an alınamadığını belirtir.", parameters: schema({ query: nullableString, status: enumeration(PRODUCT_STATUSES), stock: enumeration(CATALOG_PRODUCT_STOCK_FILTERS) }) },
  { name: "product_details", action: "catalog_admin.read", description: "Aramadan gelen productId ile ürünün varyant, gerçek fiyat, barkod, stok ve isteğe bağlı fiziksel bilgilerini okur. valueMilli ölçü sayısı 1000'e bölünür, stok adediyle karıştırılmaz.", parameters: schema({ productId: { type: "string" } }) },
  { name: "orders_search", action: "orders.read", description: "Sipariş numarasıyla veya arama ifadesiyle ilk 10 siparişi okur. Durum filtresi optional/null. Müşteri iletişim ve adres bilgisi içermez.", parameters: schema({ query: nullableString, status: enumeration(ORDER_STATUSES) }) },
  { name: "order_details", action: "orders.read", description: "Aramadan gelen orderId ile sipariş kalemleri, ödeme, kargo durumu ve tutarlarını okur. Değişiklik veya ödeme yapmaz.", parameters: schema({ orderId: { type: "string" } }) },
  { name: "customers_search", action: "customers.read", description: "Müşteriyi isimle bulur; ilk 10 ad, sipariş sayısı ve alışveriş toplamı. E-posta, telefon ve adres verilmez.", parameters: schema({ query: { type: "string" } }) },
  { name: "promotions_search", action: "promotions.read", description: "Gerçek kampanya ve indirim kayıtlarını arar, ilk 10 mekanik/durum/süre bilgisini okur. Kampanya oluşturmaz veya yayınlamaz.", parameters: schema({ query: nullableString }) },
  { name: "inventory_balances", action: "inventory.read", description: "Seçilen veya varsayılan depoda varyant stoklarını okur. maximumQuantity ile sıfır veya eşik altı depo stoku. Depo kapsamıdır; mağaza toplamı veya rezerve sonrası kullanılabilir stok değildir. İlk10 ve gerçek eşleşme sayısı.", parameters: schema({ locationId: nullableString, maximumQuantity: { type: ["integer", "null"], minimum: 0, maximum: 100 } }) },
  { name: "sales_summary", action: "analytics.read", description: "Mağaza saat diliminde today/yesterday/7d/30d veya from/to YYYY-MM-DD dönemi. Para birimleri ayrı; brüt, iade ve net tutarlar minor units/100. En fazla366gün ve gelecek tarih yok.", parameters: schema({ period: enumeration(["today", "yesterday", "7d", "30d"]), from: nullableString, to: nullableString }) },
  { name: "panel_help", action: null, description: "Panel kullanımı, ürün/gram/barkod/POS/indirim/rapor/AI bağlantısı için bakımı yapılan yardım ve güvenli ekran bağlantıları. Gerçek mağaza verisi yerine geçmez.", parameters: schema({ query: { type: "string" } }) },
] as const);

function dateString(value: string): string {
  const date = new Date(`${value}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw Error("invalid_arguments");
  return value;
}
function localDay(now: Date, timezone: string): string {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now).filter(part => part.type !== "literal").map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
function addDays(day: string, days: number): string {
  const value = new Date(`${dateString(day)}T12:00:00Z`); value.setUTCDate(value.getUTCDate() + days); return value.toISOString().slice(0, 10);
}

export function createToshiTools(input: Readonly<{ tenantContext: TenantContext; now: Date; repositories: ToshiToolRepositories }>) {
  const { tenantContext, repositories } = input;
  const now = new Date(input.now);
  const context = { tenantContext, now };
  const allowed = (action: MerchantAction | null) => action === null || isMerchantActionAllowed(tenantContext.membership.role, action);
  const definitions: readonly Definition[] = Object.freeze(DEFINITIONS.filter(definition => allowed(definition.action)).map(({ name, description, parameters }) => Object.freeze({ name, description, parameters })));

  function bounded(result: unknown, sources: readonly ToshiSource[] = []): ToshiToolResult {
    const encoded = JSON.stringify(result);
    if (new TextEncoder().encode(encoded).byteLength > 16000) return { result: { error: "result_too_large" }, sources: [] };
    return Object.freeze({ result: JSON.parse(encoded) as unknown, sources: Object.freeze(sources.slice(0, 10)) });
  }
  function repo<T>(value: T | undefined): T { if (!value) throw Error("data_unavailable"); return value; }
  function variants(values: Awaited<ReturnType<CatalogRepository["getProductDetails"]>>["variants"]) {
    return values.slice(0, 10).map(variant => ({ id: variant.id, title: safeText(variant.title), sku: variant.sku, barcode: variant.barcode, sellingPriceMinor: variant.effectivePriceCents === undefined ? variant.priceCents : variant.effectivePriceCents, pricingMethod: variant.pricingMethod ?? "fixed_try", compareAtMinor: variant.compareAtCents, stockTracking: variant.stockTracking, stockQuantity: variant.stockTracking ? variant.stockQuantity : null, measurements: variant.measurements }));
  }

  async function execute(name: string, argumentsValue: unknown): Promise<ToshiToolResult> {
    const definition = DEFINITIONS.find(item => item.name === name);
    if (!definition) return bounded({ error: "unsupported_tool" });
    if (!allowed(definition.action)) return bounded({ error: "permission_denied" });
    let args: Record<string, unknown>;
    try { args = exactRecord(argumentsValue, Object.keys(definition.parameters.properties)); }
    catch { return bounded({ error: "invalid_arguments" }); }
    try {
      switch (name) {
        case "store_summary": {
          const result: Record<string, unknown> = { asOf: now.toISOString() };
          const sources: ToshiSource[] = [];
          if (allowed("catalog_admin.read") && repositories.catalog) {
            const value = await repositories.catalog.getDashboardSummary(context);
            result.catalog = { totalProducts: value.totalProducts, activeProducts: value.activeProducts, draftProducts: value.draftProducts, activeVariants: value.activeVariants, outOfStockVariants: value.outOfStockVariants, outOfStockProducts: value.outOfStockProducts };
            sources.push(source("Ürünler", "/products"));
          }
          if (allowed("orders.read") && repositories.orders) {
            const value = await repositories.orders.getDashboardSummary(context);
            result.orders = { totalOrders: value.totalOrders, pendingOrders: value.pendingOrders, fulfilledOrders: value.fulfilledOrders, revenueMinor: value.revenueCents, currency: value.currency, asOf: value.asOf };
            sources.push(source("Siparişler", "/orders"));
          }
          if (allowed("customers.read") && repositories.customers) {
            const value = await repositories.customers.getSummary(context);
            result.customers = { active: value.active, archived: value.archived, totalSpentMinor: value.totalSpentCents, currency: value.currency, asOf: value.asOf };
            sources.push(source("Müşteriler", "/customers"));
          }
          if (!sources.length) return bounded({ error: "data_unavailable" });
          return bounded(result, sources);
        }
        case "products_search": {
          const query = optionalText(args.query), status = selection(args.status, PRODUCT_STATUSES), stock = selection(args.stock, CATALOG_PRODUCT_STOCK_FILTERS);
          const value = await repo(repositories.catalog).listProducts({ ...context, pageSize: 10, ...(query ? { search: query } : {}), ...(status ? { status } : {}), ...(stock ? { stock } : {}) });
          return bounded({ catalogTotal: value.catalogTotal, hasMore: value.nextCursor !== undefined, items: value.items.slice(0, 10).map(product => {
            const summary = value.variantSummaries?.[product.id];
            return { id: product.id, title: safeText(product.title), currency: product.currency, status: product.status, sellingPriceMinor: summary ? (summary.effectivePriceCents === undefined ? summary.priceCents : summary.effectivePriceCents) : null, pricingMethod: summary?.pricingMethod, sku: summary?.sku, stock: summary?.productStock ?? null };
          }) }, [source("Ürünler", "/products")]);
        }
        case "product_details": {
          const id = entityId(args.productId), value = await repo(repositories.catalog).getProductDetails({ ...context, productId: id });
          if (value.product.id !== id) throw Error("data_unavailable");
          return bounded({ id, title: safeText(value.product.title), currency: value.product.currency, status: value.product.status, description: safeText(value.product.description ?? "", 1200), variants: variants(value.variants), hasMoreVariants: value.variants.length > 10 }, [source(value.product.title, `/products/${id}`)]);
        }
        case "orders_search": {
          const query = optionalText(args.query), status = selection(args.status, ORDER_STATUSES);
          const value = await repo(repositories.orders).listOrders({ ...context, pageSize: 10, sort: "newest", ...(query ? { search: query } : {}), ...(status ? { status } : {}) });
          return bounded({ hasMore: value.nextCursor !== undefined, items: value.items.slice(0, 10).map(order => ({ id: order.id, orderNumber: safeText(order.orderNumber), source: order.source, status: order.status, paymentStatus: order.paymentStatus, totalMinor: order.totalCents, currency: order.currency, itemCount: order.itemCount, createdAt: order.createdAt })) }, [source("Siparişler", "/orders")]);
        }
        case "order_details": {
          const id = entityId(args.orderId), value = await repo(repositories.orders).getOrder({ ...context, orderId: id });
          if (value.id !== id) throw Error("data_unavailable");
          return bounded({ id, orderNumber: safeText(value.orderNumber), source: value.source, status: value.status, paymentStatus: value.paymentStatus, currency: value.currency, totalMinor: value.totalCents, subtotalMinor: value.subtotalCents, discountMinor: value.discountCents, shippingMinor: value.shippingCents, carrier: value.tracking ? safeText(value.tracking.carrier) : null, shippedAt: value.tracking?.shippedAt ?? null, createdAt: value.createdAt, items: value.items.slice(0, 10).map(item => ({ productName: safeText(item.productName), variantName: item.variantName ? safeText(item.variantName) : undefined, quantity: item.quantity, unitPriceMinor: item.unitPriceCents, lineTotalMinor: item.lineTotalCents })), hasMoreItems: value.items.length > 10 }, [source(value.orderNumber, `/orders/${id}`)]);
        }
        case "customers_search": {
          const query = optionalText(args.query); if (!query) throw Error("invalid_arguments");
          const value = await repo(repositories.customers).list({ ...context, search: query, pageSize: 10 });
          return bounded({ hasMore: value.nextCursor !== undefined, items: value.items.slice(0, 10).map(customer => ({ id: customer.id, name: safeText(customer.displayName), orderCount: customer.orderCount, totalSpentMinor: customer.totalSpentCents, currency: customer.currency, lastOrderAt: customer.lastOrderAt })) }, [source("Müşteriler", "/customers")]);
        }
        case "promotions_search": {
          const query = optionalText(args.query), value = await repo(repositories.promotions).list({ ...context, pageSize: 10, ...(query ? { search: query } : {}) });
          return bounded({ hasMore: value.nextCursor !== null, items: value.items.slice(0, 10).map(promotion => ({ id: promotion.id, name: safeText(promotion.name), effectiveStatus: promotion.effectiveStatus, mechanism: safeText(promotion.humanMechanic, 600), triggerKind: promotion.triggerKind, startsAt: promotion.startsAt, endsAt: promotion.endsAt, used: promotion.usage.used })) }, [source("İndirimler", "/discounts")]);
        }
        case "inventory_balances": {
          const inventory = repo(repositories.inventory);
          const id = args.locationId === null ? undefined : entityId(args.locationId);
          const maximum = args.maximumQuantity;
          if (maximum !== null && (!Number.isSafeInteger(maximum) || (maximum as number) < 0 || (maximum as number) > 100)) throw Error("invalid_arguments");
          const locations = await inventory.listLocations(context), location = id ? locations.find(item => item.id === id && item.status === "active") : locations.find(item => item.isDefault && item.status === "active");
          if (!location) return bounded({ error: "location_not_found", locations: locations.filter(item => item.status === "active").slice(0, 10).map(item => ({ id: item.id, name: safeText(item.name) })) });
          const balances = await inventory.listBalances({ ...context, locationId: location.id });
          const filtered = balances.filter(item => maximum === null || item.quantity <= (maximum as number)).sort((a, b) => a.quantity - b.quantity);
          const choices = repositories.catalog?.listVariantChoices && allowed("catalog_admin.read") ? await repositories.catalog.listVariantChoices(context) : [];
          return bounded({ scope: "location", location: safeText(location.name), matchingVariants: filtered.length, maximumQuantity: maximum, hasMore: filtered.length > 10, items: filtered.slice(0, 10).map(item => {
            const choice = choices.find(value => value.variantId === item.variantId);
            return { variantId: item.variantId, sku: choice?.sku, productTitle: choice ? safeText(choice.productTitle) : undefined, variantTitle: choice ? safeText(choice.variantTitle) : undefined, quantity: item.quantity };
          }) }, [source("Stok", "/products")]);
        }
        case "sales_summary": {
          const analytics = repo(repositories.analytics), timezone = await analytics.commerceTimezone(context);
          const period = selection(args.period, ["today", "yesterday", "7d", "30d"] as const), from = optionalText(args.from, 10), to = optionalText(args.to, 10);
          if ((period && (from || to)) || (!!from !== !!to)) throw Error("invalid_arguments");
          const today = localDay(now, timezone);
          const startDay = from ? dateString(from) : addDays(today, period === "yesterday" ? -1 : period === "7d" ? -6 : period === "30d" ? -29 : 0);
          const endDay = to ? addDays(dateString(to), 1) : period === "yesterday" ? today : null;
          const start = new Date(zonedCivilDayStartToIso(startDay, timezone));
          const end = endDay ? new Date(Math.min(now.getTime(), new Date(zonedCivilDayStartToIso(endDay, timezone)).getTime())) : now;
          if (start >= end || end.getTime() - start.getTime() > 366 * DAY || (to && dateString(to) > today)) throw Error("invalid_arguments");
          const value = await analytics.commerceSnapshot({ ...context, rangeStart: start, rangeEnd: end, filters: { timezone } });
          return bounded({ rangeStart: value.rangeStart, rangeEnd: value.rangeEnd, timezone, currencies: value.currencies.slice(0, 10).map(bucket => ({ currency: bucket.currency, paidOrders: bucket.paidOrders, grossRevenueMinor: bucket.grossRevenueMinor, refundedMinor: bucket.refundedMinor, netRevenueMinor: bucket.grossRevenueMinor - bucket.refundedMinor })), hasMoreCurrencies: value.currencies.length > 10 }, [source("Analizler", "/analytics")]);
        }
        case "panel_help": {
          const query = optionalText(args.query); if (!query) throw Error("invalid_arguments");
          const articles = findPanelHelp(query);
          return bounded({ articles: articles.map(article => ({ title: article.title, text: article.text })) }, articles.map(article => source(article.title, article.href)));
        }
        default: return bounded({ error: "unsupported_tool" });
      }
    } catch (error) {
      const code = error instanceof Error && error.message === "invalid_arguments" ? "invalid_arguments" : "data_unavailable";
      return bounded({ error: code });
    }
  }
  return Object.freeze({ definitions, execute });
}
