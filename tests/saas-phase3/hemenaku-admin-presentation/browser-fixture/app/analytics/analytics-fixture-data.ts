// Local presentation data only. No database, account, provider or production state.
export const ANALYTICS_FIXTURE_NOW = "2026-09-29T12:00:00.000Z";
export const ANALYTICS_PRODUCT_IDS = [1, 2, 3, 4, 5].map((value) => `96000000-0000-4000-8000-${String(value).padStart(12, "0")}`);
const CATEGORY_ID = "96000000-0000-4000-8000-000000000010";
const BRAND_ID = "96000000-0000-4000-8000-000000000011";
const REPORTS = new Set(["overview", "funnel", "abandoned-carts", "acquisition", "products"]);
const DAY = 86_400_000;

export type AnalyticsFixtureState = { attempts: Map<string, number> };
export function createAnalyticsFixtureState(): AnalyticsFixtureState { return { attempts: new Map() }; }

function rangeFor(query: URLSearchParams) {
  const from = query.get("from"), to = query.get("to");
  const custom = Boolean(from && to && /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to));
  const range = query.get("range") ?? "30d";
  const days = range === "today" ? 1 : range === "7d" ? 7 : range === "90d" ? 90 : 30;
  const end = custom ? new Date(`${to}T21:00:00.000Z`).getTime() : Date.parse("2026-09-29T21:00:00.000Z");
  const start = custom ? new Date(`${from}T00:00:00.000Z`).getTime() - 3 * 3_600_000 : end - days * DAY;
  return { start: new Date(start).toISOString(), end: new Date(end).toISOString(), timezone: query.get("timezone") ?? "Europe/Istanbul", label: custom ? "Özel aralık" : range === "today" ? "Bugün" : `Son ${days} gün`, custom };
}

function currency(code: string, empty: boolean, previous: boolean) {
  const scale = empty ? 0 : previous ? 0.82 : 1;
  const eur = code === "EUR";
  const count = (value: number) => Math.round(value * scale);
  return { currency: code, activeCarts: count(74), candidateCarts: count(28), eligibleCarts: count(160), checkoutStarts: count(860), eligibleCheckoutStarts: count(794), checkoutAbandoned: count(322), paymentFailures: count(34), paidOrders: count(eur ? 62 : 428), grossRevenueMinor: count(eur ? 186_400 : 12_845_000), refundedMinor: count(eur ? 6_200 : 185_000), abandonedCarts: count(216), abandonedValueMinor: count(eur ? 54_000 : 4_280_000), recoveredCarts: count(39), recoveredGrossMinor: count(eur ? 19_600 : 865_000), recoveredRefundedMinor: count(eur ? 900 : 12_000), recoveredNetMinor: count(eur ? 18_700 : 853_000) };
}

function distribute(total: number, length: number) {
  const weights = Array.from({ length }, (_, index) => 8 + ((index * 7 + 3) % 13) + Math.floor(index / 6));
  const sum = weights.reduce((result, value) => result + value, 0);
  const values = weights.map((weight) => Math.floor(total * weight / sum));
  values[values.length - 1] += total - values.reduce((result, value) => result + value, 0);
  return values;
}

function snapshot(query: URLSearchParams, range: ReturnType<typeof rangeFor>, previous = false, report = "overview") {
  const empty = query.get("range") === "7d";
  const code = query.get("currency");
  const codes = code ? [code] : range.custom ? ["TRY", "EUR"] : ["TRY"];
  const currencies = codes.map((value) => currency(value, empty, previous));
  const duration = Date.parse(range.end) - Date.parse(range.start);
  const start = Date.parse(range.start) - (previous ? duration : 0);
  const end = Date.parse(range.end) - (previous ? duration : 0);
  const days = Math.max(1, Math.min(401, Math.ceil(duration / DAY)));
  const series = currencies.flatMap((bucket) => {
    const revenues = distribute(bucket.grossRevenueMinor, days), orders = distribute(bucket.paidOrders, days);
    return revenues.map((grossRevenueMinor, index) => ({ startsAt: new Date(start + index * DAY).toISOString(), currency: bucket.currency, paidOrders: orders[index], grossRevenueMinor, abandonedCarts: empty ? 0 : 4 + index % 8, recoveredCarts: empty ? 0 : index % 3 }));
  });
  const titles = ["Keten Ceket", "Dokulu Omuz Çantası", "Ribana Basic Tişört", "Seramik Kahve Fincanı", "Süet Loafer"];
  let products = empty ? [] : currencies.flatMap((bucket) => titles.map((title, index) => ({ productId: ANALYTICS_PRODUCT_IDS[index], title, currency: bucket.currency, categoryId: CATEGORY_ID, categoryName: index === 3 ? "Yaşam" : "Giyim", brandId: BRAND_ID, brandName: "Celebix Atelier", checkoutStarts: Math.round((240 - index * 37) * (previous ? 0.82 : 1)), paidOrders: Math.round((126 - index * 19) * (previous ? 0.82 : 1)), quantity: 136 - index * 19, revenueMinor: Math.round(bucket.grossRevenueMinor * [0.32, 0.24, 0.19, 0.14, 0.11][index]), abandonedAppearances: 64 - index * 9, recoveredRevenueMinor: Math.round(bucket.recoveredNetMinor * (0.3 - index * 0.04)) })));
  const search = (query.get("search") ?? "").toLocaleLowerCase("tr-TR");
  products = products.filter((item) => (!search || item.title.toLocaleLowerCase("tr-TR").includes(search)) && (!query.get("product") || item.productId === query.get("product")) && (!query.get("category") || item.categoryId === query.get("category")) && (!query.get("brand") || item.brandId === query.get("brand")));
  const sources = ["google", "instagram", "direct", "newsletter"];
  const mediums = ["organic", "social", "(none)", "email"];
  const attribution = empty ? [] : currencies.flatMap((bucket) => sources.flatMap((source, index) => ["first", "last"].map((touch) => ({ touch, source, medium: mediums[index], campaign: index === 1 ? "sonbahar" : null, currency: bucket.currency, paidOrders: Math.round(bucket.paidOrders * [0.38, 0.29, 0.23, 0.10][index]), grossRevenueMinor: Math.round(bucket.grossRevenueMinor * [0.38, 0.29, 0.23, 0.10][index]), abandonedCarts: 54 - index * 9, recoveredRevenueMinor: Math.round(bucket.recoveredNetMinor / 4) }))))
    .filter((item) => (report !== "acquisition" || item.touch === (query.get("touch") === "first" ? "first" : "last")) && (!query.get("source") || item.source === query.get("source")) && (!query.get("campaign") || item.campaign === query.get("campaign")));
  const labels = ["Ada Yılmaz", "Deniz Kaya", "Ece Demir", "Misafir müşteri"];
  let carts = empty ? [] : currencies.flatMap((bucket) => labels.map((customerLabel, index) => ({ id: `97000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`, customerLabel, productSummary: titles[index], subtotalMinor: bucket.currency === "EUR" ? 8_000 + index * 2_000 : 249_900 + index * 75_000, discountMinor: 0, shippingMinor: 0, totalMinor: bucket.currency === "EUR" ? 8_000 + index * 2_000 : 249_900 + index * 75_000, currency: bucket.currency, lastActivityAt: `2026-09-29T${String(10 - index).padStart(2, "0")}:20:00.000Z`, abandonedAt: index === 3 ? null : "2026-09-29T11:00:00.000Z", source: sources[index], campaign: index === 1 ? "sonbahar" : null, device: index % 2 ? "desktop" : "mobile", lifecycle: ["abandoned", "recovered", "candidate", "active"][index], contactable: index !== 3, contacted: index === 1 })))
    .filter((item) => (!search || `${item.customerLabel} ${item.productSummary}`.toLocaleLowerCase("tr-TR").includes(search)) && (!query.get("lifecycle") || item.lifecycle === query.get("lifecycle")) && (!query.get("device") || item.device === query.get("device")) && (!query.get("source") || item.source === query.get("source")) && (!query.get("campaign") || item.campaign === query.get("campaign")) && (!query.get("contact") || item.contactable === (query.get("contact") === "contactable")) && (!query.get("minValue") || item.totalMinor >= Number(query.get("minValue"))) && (!query.get("maxValue") || item.totalMinor <= Number(query.get("maxValue"))));
  const page = Math.max(1, Number(query.get("page")) || 1);
  const productPage = { page, pageSize: 100, totalItems: products.length, totalPages: Math.ceil(products.length / 100) };
  const cartPage = { page, pageSize: 100, totalItems: carts.length, totalPages: Math.ceil(carts.length / 100) };
  products = products.slice((page - 1) * 100, page * 100); carts = carts.slice((page - 1) * 100, page * 100);
  return { rangeStart: new Date(start).toISOString(), rangeEnd: new Date(end).toISOString(), currencies, attribution, products, productPage, cartPage, series, carts, worker: { pending: 2, claimed: 1, retry: 0, deadLetter: 0, oldestPendingSeconds: 18, lastSuccessfulDelivery: ANALYTICS_FIXTURE_NOW, deliveryLatencyMilliseconds: 240 } };
}

function trafficFor(report: string, query: URLSearchParams, range: ReturnType<typeof rangeFor>, previous = false) {
  // Currency cohorts, carts and first-touch attribution have no compatible traffic scope.
  if (query.has("currency") || report === "abandoned-carts" || (report === "acquisition" && query.get("touch") === "first")) return null;
  const empty = query.get("range") === "7d", partial = query.get("range") === "90d";
  const n = (value: number) => empty ? 0 : Math.round(value * (previous ? 0.82 : 1));
  const metric = (rows: readonly (readonly [string, number])[]) => ({ items: empty ? [] : rows.map(([label, value]) => ({ label, value: n(value) })) });
  const summary = { visitors: n(12_680), pageviews: n(34_920), visits: n(15_240), bounceRateBasisPoints: empty ? 0 : 3240, averageVisitSeconds: empty ? 0 : 164, visitsSeries: [0, 1, 2, 3, 4, 5].map((index) => ({ at: new Date(Date.parse(range.start) + index * DAY).toISOString(), value: n(320 + index * 80) })) };
  // Overview event counts are independent events, not an ordered session cohort.
  const eventRows: readonly (readonly [string, number])[] = report === "funnel"
    ? [["product_view", 6400], ["add_to_cart", 2150], ["view_cart", 1750], ["begin_checkout", 860], ["payment_method_selected", 680], ["purchase", 428]]
    : [["product_view", 9400], ["add_to_cart", 12_800], ["begin_checkout", 1400]];
  return { summary, events: partial ? null : { items: eventRows.map(([label, value]) => ({ label, value: n(value) })) }, sources: partial ? null : metric([["google", 4818], ["instagram", 3677], ["direct", 2916], ["newsletter", 1269]]), metrics: { path: partial ? null : metric([["/", 8900], ["/collections/sonbahar", 6450], ["/products/keten-ceket", 4100]]), referrer: metric([["google.com", 4818], ["instagram.com", 3677]]), device: partial ? null : metric([["mobile", 8115], ["desktop", 4185], ["tablet", 380]]), country: metric([["Türkiye", 11_880], ["Almanya", 800]]) }, views: partial ? null : metric(ANALYTICS_PRODUCT_IDS.map((id, index) => [id, 1840 - index * 240] as const)), adds: partial ? null : metric(ANALYTICS_PRODUCT_IDS.map((id, index) => [id, 490 - index * 71] as const)), breakdown: { items: empty ? [] : ["google", "instagram", "direct", "newsletter"].map((source, index) => ({ source, medium: ["organic", "social", "(none)", "email"][index], campaign: index === 1 ? "sonbahar" : null, visitors: n([4818, 3677, 2916, 1269][index]), pageviews: n(8000 - index * 1450), productViews: n(1900 - index * 260), addsToCart: n(630 - index * 99), checkouts: n(290 - index * 45) })) } };
}

export function analyticsFixturePayload(report: string, query = new URLSearchParams()) {
  const { custom: _custom, ...range } = rangeFor(query);
  const sourceRange = rangeFor(query);
  const intentionalNull = report === "abandoned-carts" || (report === "acquisition" && query.get("touch") === "first");
  const status = query.get("range") === "90d" || (query.has("currency") && !intentionalNull) ? "degraded" : "complete";
  return { status, message: null, traffic: trafficFor(report, query, sourceRange), comparisonTraffic: query.get("compare") === "1" ? trafficFor(report, query, sourceRange, true) : null, commerce: snapshot(query, sourceRange, false, report), comparisonCommerce: query.get("compare") === "1" ? snapshot(query, sourceRange, true, report) : null, range };
}

export function analyticsFixtureResponse(path: readonly string[], requestUrl: string, state: AnalyticsFixtureState) {
  if (path.length !== 1) return null;
  if (path[0] === "active") return Response.json({ schemaVersion: 1, status: "ready", activeVisitors: 7, asOf: ANALYTICS_FIXTURE_NOW });
  if (!REPORTS.has(path[0])) return null;
  const query = new URL(requestUrl).searchParams;
  if (query.get("range") === "today" && path[0] === "overview") {
    const key = `${path[0]}:${query.toString()}`, attempt = state.attempts.get(key) ?? 0;
    state.attempts.set(key, attempt + 1);
    if (attempt === 0) return Response.json({ code: "unavailable" }, { status: 503 });
  }
  return Response.json(analyticsFixturePayload(path[0], query));
}
