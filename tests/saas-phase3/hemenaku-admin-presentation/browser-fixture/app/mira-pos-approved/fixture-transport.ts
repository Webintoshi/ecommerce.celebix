import {
  calculateInStoreTotals, parseInStoreSaleIntent, parseInStoreSale, parseInStorePosCustomerIntent,
  type InStoreBootstrap, type InStorePosCustomer, type InStoreProduct, type InStoreSale,
  type InStoreSaleIntent, type InStoreSaleLine, type InStoreSaleResult, type InStoreStaffGrant,
} from "@celebix/saas-contracts";

export const POS_SCENARIOS = ["filled", "empty", "loading", "error", "readonly", "partial", "pending", "received", "completed"] as const;
export type PosScenario = typeof POS_SCENARIOS[number];
type FixtureOptions = { scenario: PosScenario; latency?: number; mutation?: string; origin?: string };
const uuid = (suffix: number) => `a7100000-0000-4000-8000-${String(suffix).padStart(12, "0")}`;
export const LOCATION_ID = uuid(1), SECOND_LOCATION_ID = uuid(2), ACTOR_ID = uuid(3);
const NOW = "2026-10-03T10:00:00.000Z", SALE_ID = uuid(20), RECOVERY_ID = uuid(21);
export const FIXTURE_CUSTOMERS: readonly InStorePosCustomer[] = [
  { id: uuid(10), name: "Ayşe Kaya", firstName: "Ayşe", lastName: "Kaya", phone: "+905550001122", email: "ayse@example.test", archived: false },
  { id: uuid(11), name: "Deniz Yılmaz", firstName: "Deniz", lastName: "Yılmaz", phone: "+905550002233", email: null, archived: false },
  { id: uuid(12), name: "Ayşe Demir", firstName: "Ayşe", lastName: "Demir", phone: "+905550003344", email: null, archived: true },
];
export const FIXTURE_PRODUCTS: readonly InStoreProduct[] = [
  { productId: uuid(100), variantId: uuid(101), productName: "Ekru triko", variantName: "Ekru / M", sku: "SRA-TRK-EKR-M", barcode: "8690000000101", imageUrl: "/seo-assets/product-ekru-triko.webp", unitPriceCents: 129900, pricingUnavailable: false, availableQuantity: 12, stockTracking: true, discountEligible: true },
  { productId: uuid(110), variantId: uuid(111), productName: "Mavi jean", variantName: "Mavi / 38", sku: "SRA-JEAN-MV-38", barcode: "8690000000111", imageUrl: "/seo-assets/product-mavi-jean.webp", unitPriceCents: 189900, pricingUnavailable: false, availableQuantity: 8, stockTracking: true, discountEligible: true },
  { productId: uuid(120), variantId: uuid(121), productName: "Dantel bluz", variantName: "Beyaz / S", sku: "SRA-BLZ-BYZ-S", barcode: "8690000000121", imageUrl: "/seo-assets/product-dantel-bluz.webp", unitPriceCents: 89900, pricingUnavailable: false, availableQuantity: 6, stockTracking: true, discountEligible: true },
  { productId: uuid(130), variantId: uuid(131), productName: "Siyah pantolon", variantName: "Siyah / 36", sku: "SRA-PNT-SYH-36", barcode: "8690000000131", imageUrl: "/seo-assets/product-siyah-pantolon.webp", unitPriceCents: 149900, pricingUnavailable: false, availableQuantity: 10, stockTracking: true, discountEligible: true },
  { productId: uuid(140), variantId: uuid(141), productName: "Antrasit jean", variantName: "Antrasit / 40", sku: "SRA-JEAN-ANT-40", barcode: "8690000000141", imageUrl: "/seo-assets/product-antrasit-jean.webp", unitPriceCents: 199900, pricingUnavailable: false, availableQuantity: 0, stockTracking: true, discountEligible: true },
  { productId: uuid(150), variantId: uuid(151), productName: "Kargo pantolon", variantName: "Haki / M", sku: "SRA-KARGO-HK-M", barcode: "8690000000151", imageUrl: "/seo-assets/product-kargo-pantolon.webp", unitPriceCents: 179900, pricingUnavailable: false, availableQuantity: 7, stockTracking: true, discountEligible: false },
  { productId: uuid(160), variantId: uuid(161), productName: "Fiyat bekleyen ürün", variantName: "Standart", sku: "SRA-PRC-01", barcode: "8690000000161", imageUrl: null, unitPriceCents: null, pricingUnavailable: true, availableQuantity: 5, stockTracking: true, discountEligible: true },
];

const clone = <T,>(value: T): T => structuredClone(value);
const json = (data: unknown) => new Response(JSON.stringify({ data }), { headers: { "content-type": "application/json" } });
const failure = (code: string, status = 422) => new Response(JSON.stringify({ code }), { status, headers: { "content-type": "application/json" } });
class FixtureFailure extends Error { constructor(readonly code: string, readonly status = 422) { super(code); } }
const requireCondition = (condition: unknown, code: string, status = 422) => { if (!condition) throw new FixtureFailure(code, status); };
const normalized = (value: string) => value.toLocaleLowerCase("tr-TR");

/** Isolated local transport. It never calls a server or an original fetch function. */
export function createPosFixtureTransport(options: FixtureOptions) {
  const origin = options.origin ?? "http://127.0.0.1:3527";
  const products = clone(FIXTURE_PRODUCTS) as InStoreProduct[], customers = clone(FIXTURE_CUSTOMERS) as InStorePosCustomer[];
  const sales = new Map<string, InStoreSale>(), operations = new Map<string, { fingerprint: string; result: unknown }>();
  const accountVersions = new Map(customers.map(customer => [customer.id, 1]));
  const events: Record<string, unknown>[] = [], requests: { method: string; path: string; operationId: string | null }[] = [];
  const grants: InStoreStaffGrant[] = [{ membershipId: ACTOR_ID, label: "Elif · Mağaza sahibi", role: "store_owner", enabled: true, locationIds: [LOCATION_ID, SECOND_LOCATION_ID], discountLimitBps: 3000, canEditPrice: true, canSellOnCredit: true, canCollectReceivables: true, version: 1 }, { membershipId: uuid(4), label: "Merve · Kasiyer", role: "cashier", enabled: true, locationIds: [LOCATION_ID], discountLimitBps: 1000, canEditPrice: false, canSellOnCredit: false, canCollectReceivables: false, version: 1 }];
  let activeId: string | null = null, bootstrapAttempt = 0, mutationAttempt = 0, customerSequence = 500;
  const scopeKey = `mira-pos-approved:${options.scenario}:${crypto.randomUUID()}`;
  const locations = [{ id: LOCATION_ID, name: "Ana mağaza", isDefault: true }, { id: SECOND_LOCATION_ID, name: "Merkez depo", isDefault: false }];

  function fromIntent(id: string, intent: InStoreSaleIntent, previous?: InStoreSale): InStoreSale {
    const customer = customers.find(item => item.id === intent.customerId) ?? null;
    const lines = intent.items.map(item => {
      const product = products.find(row => row.variantId === item.variantId);
      requireCondition(product && !product.pricingUnavailable && product.unitPriceCents !== null, "pricing_unavailable");
      const price = item.unitPriceOverrideCents ?? product!.unitPriceCents!;
      requireCondition(product!.discountEligible || price >= product!.unitPriceCents!, "discount_denied");
      return { productId: product!.productId, variantId: product!.variantId, productName: product!.productName, variantName: product!.variantName, sku: product!.sku, barcode: product!.barcode, imageUrl: product!.imageUrl, unitPriceCents: price, catalogUnitPriceCents: product!.unitPriceCents!, unitPriceOverrideCents: item.unitPriceOverrideCents ?? null, priceOverrideActorMembershipId: item.unitPriceOverrideCents == null ? null : ACTOR_ID, quantity: item.quantity, discountEligible: product!.discountEligible, lineSubtotalCents: price * item.quantity, allocatedDiscountCents: 0, lineNetCents: price * item.quantity };
    });
    const totals = calculateInStoreTotals(lines, intent.discount);
    let remaining = totals.discountCents;
    const eligible = lines.filter(line => line.discountEligible);
    for (const line of eligible) {
      const allocated = line === eligible.at(-1) ? remaining : Math.floor(totals.discountCents * line.lineSubtotalCents / totals.eligibleSubtotalCents);
      line.allocatedDiscountCents = allocated; line.lineNetCents -= allocated; remaining -= allocated;
    }
    const collection = intent.initialCollectionCents ?? totals.totalCents;
    requireCondition(collection <= totals.totalCents, "collection_invalid");
    requireCondition(collection >= totals.totalCents || customer && !customer.archived && customer.phone, "customer_required");
    if (intent.customerId) requireCondition(customer && !customer.archived, "customer_archived");
    return parseInStoreSale({ id, saleNumber: previous?.saleNumber ?? `MS-001${sales.size + 1}`, status: "draft", version: (previous?.version ?? 0) + 1, locationId: intent.locationId, locationName: locations.find(location => location.id === intent.locationId)?.name ?? "Ana mağaza", ownerMembershipId: ACTOR_ID, ownerLabel: "Elif · Mağaza sahibi", customerName: customer?.name ?? intent.customerName, note: intent.note, discount: intent.discount, paymentMethod: collection === 0 ? null : intent.paymentMethod ?? null, items: lines, totals, createdAt: previous?.createdAt ?? NOW, updatedAt: NOW, paymentReceivedAt: null, completedAt: null, orderId: null, orderNumber: null, contractVersion: 3, customerId: customer?.id ?? null, customer, initialCollectionCents: collection, dueDate: intent.dueDate ?? null, finance: null }, 3);
  }

  const baseIntent = (credit = false): InStoreSaleIntent => ({ locationId: LOCATION_ID, items: FIXTURE_PRODUCTS.slice(0, 4).map((product, index) => ({ variantId: product.variantId, quantity: index === 1 ? 2 : 1, unitPriceOverrideCents: null })), discount: { kind: "percentage", percentageBps: 500 }, customerId: credit ? customers[0].id : null, customerName: credit ? customers[0].name : null, note: credit ? "Teslimat mağazadan yapıldı." : null, paymentMethod: "cash", initialCollectionCents: credit ? 200000 : null, dueDate: credit ? "2026-10-15" : null });
  function completedSale(sale: InStoreSale, index: number, credit = false): InStoreSale {
    const collectedCents = credit ? Math.min(200000, sale.totals.totalCents) : sale.totals.totalCents, dueCents = sale.totals.totalCents - collectedCents;
    return parseInStoreSale({ ...sale, initialCollectionCents: collectedCents, status: "completed", version: sale.version + 3, paymentReceivedAt: collectedCents ? NOW : null, completedAt: NOW, orderId: uuid(900 + index), orderNumber: `POS-${String(index + 101).padStart(7, "0")}`, finance: { status: dueCents ? collectedCents ? "partial" : "unpaid" : "paid", collectedCents, dueCents, refundDueCents: 0, version: 1, receipts: collectedCents ? [{ id: uuid(800 + index), amountCents: collectedCents, paymentMethod: sale.paymentMethod ?? "cash", receivedAt: NOW, actorMembershipId: ACTOR_ID, reversed: false }] : [] } }, 3);
  }
  for (let i = 0; i < 3; i++) { const seed = fromIntent(uuid(30 + i), { ...baseIntent(i === 0), discount: null }); sales.set(seed.id, { ...seed, status: "held", version: 2, saleNumber: `MS-000${81 + i}` }); }
  for (let i = 0; i < 2; i++) { const seed = fromIntent(uuid(40 + i), baseIntent()); sales.set(seed.id, { ...seed, status: i ? "payment_received" : "payment_pending", version: 3 + i, paymentReceivedAt: i ? NOW : null, saleNumber: `MS-000${91 + i}` }); }
  for (let i = 0; i < 25; i++) { const seed = fromIntent(uuid(60 + i), baseIntent(i === 0)); sales.set(seed.id, completedSale({ ...seed, saleNumber: `MS-${String(100 + i).padStart(7, "0")}` }, i, i === 0)); }
  let recoveryMarker: { scopeKey: string; kind: string; saleId: string; operationId: string; expectedVersion: number; expectedTotalCents: number; contractVersion: number; paymentMethod?: null } | null = null;
  if (!["empty", "loading"].includes(options.scenario)) {
    let sale = fromIntent(SALE_ID, baseIntent(options.scenario === "partial" || options.scenario === "completed"));
    if (options.scenario === "pending") sale = parseInStoreSale({ ...sale, status: "payment_pending", version: 2 }, 3);
    if (options.scenario === "received") sale = parseInStoreSale({ ...sale, status: "payment_received", paymentReceivedAt: NOW, version: 3 }, 3);
    if (options.scenario === "completed") sale = completedSale(sale, 50, true);
    sales.set(sale.id, sale);
    if (["pending", "received", "completed"].includes(options.scenario)) {
      const kind = options.scenario === "pending" ? "prepare" : options.scenario === "received" ? "payment" : "complete";
      recoveryMarker = { scopeKey, kind, saleId: sale.id, operationId: RECOVERY_ID, expectedVersion: sale.version - 1, expectedTotalCents: sale.totals.totalCents, contractVersion: 3, ...(kind === "payment" ? { paymentMethod: null } : {}) };
      operations.set(RECOVERY_ID, { fingerprint: "fixture-startup-recovery", result: { sale, replayed: false, priceChanged: false } });
    } else activeId = sale.id;
  }

  function bootstrap(): InStoreBootstrap {
    const completed = [...sales.values()].filter(sale => sale.status === "completed"), pending = [...sales.values()].filter(sale => ["payment_pending", "payment_received"].includes(sale.status));
    const grossCents = completed.reduce((sum, sale) => sum + sale.totals.subtotalCents, 0), discountCents = completed.reduce((sum, sale) => sum + sale.totals.discountCents, 0);
    const canSell = options.scenario !== "readonly";
    return { scopeKey, locations, permissions: { canSell, canEditPrice: canSell, canDiscount: canSell, discountLimitBps: 3000, canResolve: canSell, canManageStaff: canSell, canSellOnCredit: canSell, canCollectReceivables: canSell, creditSalesAvailable: true }, activeDraft: activeId && sales.get(activeId)?.status === "draft" ? sales.get(activeId)! : null, heldSales: [...sales.values()].filter(sale => sale.status === "held").slice(0, 20), pendingSales: pending.slice(0, 20), recentSales: completed.slice(0, 20), summary: { completedCount: completed.length, grossCents, discountCents, netCents: grossCents - discountCents, pendingPaymentCount: pending.length } };
  }
  const result = (sale: InStoreSale): InStoreSaleResult => ({ sale, replayed: false, priceChanged: false });
  function receivables(customerId: string) {
    return [...sales.values()].filter(sale => sale.customerId === customerId && sale.status === "completed" && sale.finance && sale.orderId).map(sale => ({ id: sale.id, customerId, customerName: sale.customerName!, customerPhone: sale.customer?.phone ?? null, customerArchived: sale.customer?.archived ?? false, orderId: sale.orderId, orderNumber: sale.orderNumber, channel: "POS", currency: "TRY", saleCents: sale.totals.totalCents, collectedCents: sale.finance!.collectedCents, returnCents: 0, refundedCents: 0, dueCents: sale.finance!.dueCents, refundDueCents: sale.finance!.refundDueCents, occurredAt: sale.createdAt, dueDate: sale.dueDate ?? null, version: sale.finance!.version }));
  }
  function customerAccount(customerId: string) {
    const customer = customers.find(row => row.id === customerId); requireCondition(customer, "not_found", 404);
    const rows = receivables(customerId);
    return { customerId, customerName: customer!.name, customerPhone: customer!.phone, customerArchived: customer!.archived, currency: "TRY", version: accountVersions.get(customerId) ?? 1, dueCents: rows.reduce((sum, row) => sum + row.dueCents, 0), refundDueCents: 0, receivables: rows, events: events.filter(event => event.customerId === customerId) };
  }
  function collectionPreview(customerId: string, orderId: string | null, amount: number) {
    const account = customerAccount(customerId), rows = account.receivables.filter(row => !orderId || row.orderId === orderId), dueCents = rows.reduce((sum, row) => sum + row.dueCents, 0);
    requireCondition(amount > 0 && Number.isSafeInteger(amount) && amount <= dueCents, "overpayment");
    let remaining = amount;
    const allocations = rows.flatMap(row => { const allocated = Math.min(remaining, row.dueCents); remaining -= allocated; return allocated ? [{ receivableId: row.id, orderId: row.orderId, amountCents: allocated }] : []; });
    return { customerId, currency: "TRY", version: account.version, dueCents, allocations };
  }
  function recordOperation(key: string, fingerprint: string, compute: () => unknown): unknown {
    requireCondition(key, "invalid_input");
    const stored = operations.get(key);
    if (stored) { requireCondition(stored.fingerprint === fingerprint, "operation_mismatch", 409); return { ...(stored.result as Record<string, unknown>), replayed: true }; }
    requireCondition(options.scenario !== "readonly", "membership_denied", 403);
    mutationAttempt++;
    if (options.mutation === "error") throw new FixtureFailure("inventory_conflict", 409);
    const value = compute(); operations.set(key, { fingerprint, result: clone(value) });
    if (options.mutation === "unknown" && mutationAttempt === 1) throw new TypeError("local_fixture_lost_response");
    return value;
  }

  const fetchLocal = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(input instanceof Request ? input.url : String(input), origin), method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    if (url.origin !== origin) return failure("origin_denied", 403);
    const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const path = url.pathname, params = url.searchParams, headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    const operationId = headers.get("idempotency-key"); requests.push({ method, path, operationId });
    const delay = options.scenario === "loading" && path.endsWith("/bootstrap") ? Infinity : options.latency ?? 100;
    if (delay > 0) await new Promise<void>((resolve, reject) => {
      const onAbort = () => { clearTimeout(timer); signal?.removeEventListener("abort", onAbort); reject(new DOMException("Aborted", "AbortError")); };
      const timer = Number.isFinite(delay) ? setTimeout(() => { signal?.removeEventListener("abort", onAbort); resolve(); }, delay) : undefined;
      signal?.addEventListener("abort", onAbort, { once: true });
    });
    try {
      const body = method === "GET" ? null : JSON.parse(init?.body == null ? input instanceof Request ? await input.text() : "{}" : String(init.body));
      const fingerprint = `${method}:${path}:${JSON.stringify(body)}`;
      if (path === "/api/orders/in-store/bootstrap") {
        bootstrapAttempt++;
        if (options.scenario === "error" && bootstrapAttempt === 1) return failure("unavailable", 503);
        return json(bootstrap());
      }
      if (path === "/api/orders/in-store/products") {
        const term = normalized(params.get("query") ?? ""), barcode = params.get("barcode");
        const matches = products.filter(product => barcode !== null ? product.barcode === barcode : !term || normalized(`${product.productName} ${product.variantName} ${product.sku}`).includes(term));
        return json({ products: matches.slice(0, 20) });
      }
      if (path === "/api/orders/in-store/customers") {
        if (method === "GET") { const term = normalized(params.get("query") ?? ""); return json({ customers: customers.filter(customer => normalized(`${customer.name} ${customer.phone} ${customer.email}`).includes(term)).slice(0, 20) }); }
        return json(recordOperation(operationId!, fingerprint, () => {
          const intent = parseInStorePosCustomerIntent(body); requireCondition(!customers.some(customer => customer.phone === intent.phone || intent.email && customer.email === intent.email), "customer_duplicate", 409);
          const customer = { ...intent, id: uuid(customerSequence++), name: `${intent.firstName} ${intent.lastName}`, archived: false }; customers.push(customer); accountVersions.set(customer.id, 1); return { customer, replayed: false };
        }));
      }
      if (path === "/api/orders/in-store/sales") {
        if (method === "GET") {
          const status = params.get("status"), pageSize = Math.min(Number(params.get("pageSize") ?? 20), 50), offset = Number(params.get("cursor") ?? 0);
          const filtered = [...sales.values()].filter(sale => status === "pending" ? ["payment_pending", "payment_received"].includes(sale.status) : sale.status === status);
          return json({ sales: filtered.slice(offset, offset + pageSize), nextCursor: offset + pageSize < filtered.length ? String(offset + pageSize) : null });
        }
        return json(recordOperation(operationId!, fingerprint, () => { requireCondition(!sales.has(body.saleId), "invalid_input", 409); const intent = parseInStoreSaleIntent(body.intent, 3), sale = fromIntent(body.saleId, intent); sales.set(sale.id, sale); activeId = sale.id; return result(sale); }));
      }
      const saleMatch = path.match(/^\/api\/orders\/in-store\/sales\/([^/]+)(?:\/(hold|prepare|payment|complete|cancel|takeover))?$/);
      if (saleMatch) {
        const id = saleMatch[1], action = saleMatch[2];
        const stored = sales.get(id); requireCondition(stored, "not_found", 404);
        if (method === "GET") return json(stored);
        return json(recordOperation(operationId!, fingerprint, () => {
          const current = sales.get(id)!; requireCondition(body.expectedVersion === current.version, "version_conflict", 409);
          let sale: InStoreSale = current;
          if (!action) { requireCondition(current.status === "draft", "invalid_transition", 409); sale = fromIntent(id, parseInStoreSaleIntent(body.intent, 3), current); }
          else if (action === "hold") { requireCondition(["draft", "held"].includes(current.status), "invalid_transition", 409); sale = { ...current, status: body.held ? "held" : "draft", version: current.version + 1 }; }
          else if (action === "prepare") {
            requireCondition(current.status === "draft" && body.expectedTotalCents === current.totals.totalCents && current.totals.totalCents > 0, "invalid_transition", 409);
            requireCondition(current.items.every(line => !products.find(product => product.variantId === line.variantId)?.stockTracking || line.quantity <= products.find(product => product.variantId === line.variantId)!.availableQuantity), "inventory_conflict", 409);
            requireCondition(current.initialCollectionCents === 0 || current.paymentMethod, "payment_method_required");
            sale = { ...current, status: "payment_pending", version: current.version + 1 };
          } else if (action === "payment") {
            requireCondition(current.status === "payment_pending" && current.initialCollectionCents! > 0, "invalid_transition", 409);
            sale = { ...current, paymentMethod: current.paymentMethod ?? body.paymentMethod, status: "payment_received", paymentReceivedAt: NOW, version: current.version + 1 };
          } else if (action === "complete") {
            requireCondition(current.status === "payment_received" || current.status === "payment_pending" && current.initialCollectionCents === 0, "invalid_transition", 409);
            sale = completedSale(current, sales.size + 1, current.initialCollectionCents! < current.totals.totalCents);
            const collected = current.initialCollectionCents!; sale = { ...sale, initialCollectionCents: collected, version: current.version + 1, paymentReceivedAt: collected ? NOW : null, finance: { status: collected === 0 ? "unpaid" : collected < current.totals.totalCents ? "partial" : "paid", collectedCents: collected, dueCents: current.totals.totalCents - collected, refundDueCents: 0, version: 1, receipts: collected ? [{ id: uuid(1000 + sales.size), amountCents: collected, paymentMethod: current.paymentMethod!, receivedAt: NOW, actorMembershipId: ACTOR_ID, reversed: false }] : [] } };
            for (const line of current.items) { const index = products.findIndex(product => product.variantId === line.variantId); if (products[index].stockTracking) products[index] = { ...products[index], availableQuantity: products[index].availableQuantity - line.quantity }; }
            if (sale.customerId) accountVersions.set(sale.customerId, (accountVersions.get(sale.customerId) ?? 1) + 1);
          } else if (action === "cancel") { requireCondition(current.status === "payment_pending" && body.confirmUnpaid === true && !current.paymentReceivedAt, "invalid_transition", 409); sale = { ...current, status: "draft", version: current.version + 1 }; }
          else if (action === "takeover") sale = { ...current, ownerMembershipId: ACTOR_ID, ownerLabel: "Elif · Mağaza sahibi", version: current.version + 1 };
          sale = parseInStoreSale(sale, 3); sales.set(id, sale); activeId = sale.status === "draft" ? id : activeId === id ? null : activeId; return result(sale);
        }));
      }
      if (path.startsWith("/api/orders/in-store/operations/")) return json(operations.get(path.split("/").at(-1)!)?.result ?? null);
      if (path === "/api/orders/in-store/staff") return json({ staff: grants });
      if (path.startsWith("/api/orders/in-store/staff/")) return json(recordOperation(operationId!, fingerprint, () => { const id = path.split("/").at(-1)!, index = grants.findIndex(grant => grant.membershipId === id); requireCondition(index >= 0, "not_found", 404); requireCondition(grants[index].version === body.expectedVersion, "version_conflict", 409); const { expectedVersion, ...intent } = body; grants[index] = { ...grants[index], ...intent, version: expectedVersion + 1 }; return grants[index]; }));
      if (path.startsWith("/api/accounting/customers/")) return json(customerAccount(path.split("/").at(-1)!));
      if (path === "/api/accounting/collection-preview") return json(collectionPreview(params.get("customerId")!, params.get("orderId"), Number(params.get("amountCents"))));
      if (path === "/api/accounting/collections") return json(recordOperation(operationId!, fingerprint, () => {
        requireCondition(body.currency === "TRY" && body.expectedVersion === (accountVersions.get(body.customerId) ?? 1), "version_conflict", 409);
        const preview = collectionPreview(body.customerId, body.orderId, body.amountCents);
        for (const allocation of preview.allocations) {
          const current = sales.get(allocation.receivableId)!, finance = current.finance!, collectedCents = finance.collectedCents + allocation.amountCents, dueCents = finance.dueCents - allocation.amountCents;
          sales.set(current.id, { ...current, version: current.version + 1, finance: { ...finance, version: finance.version + 1, status: dueCents ? "partial" : "paid", collectedCents, dueCents, receipts: [...finance.receipts, { id: operationId!, amountCents: allocation.amountCents, paymentMethod: body.paymentMethod, actorMembershipId: ACTOR_ID, receivedAt: NOW, reversed: false }] } });
        }
        accountVersions.set(body.customerId, body.expectedVersion + 1);
        const event = { id: operationId, kind: "collection", currency: "TRY", amountCents: body.amountCents, accountId: null, customerId: body.customerId, orderId: body.orderId, channel: "POS", paymentMethod: body.paymentMethod, note: body.note, category: null, documentNumber: null, metadata: {}, actorMembershipId: ACTOR_ID, occurredAt: NOW, createdAt: NOW, reversesEventId: null, reversed: false, allocations: preview.allocations };
        events.push(event); return { operationId, replayed: false, event, account: null, customerAccount: customerAccount(body.customerId), finance: body.orderId ? [...sales.values()].find(sale => sale.orderId === body.orderId)?.finance ?? null : null };
      }));
      if (path.startsWith("/api/accounting/operations/")) return json(operations.get(path.split("/").at(-1)!)?.result ?? null);
      if (path.startsWith("/api/")) return failure("not_found", 404);
      return failure("origin_denied", 403);
    } catch (error) {
      if (error instanceof FixtureFailure) return failure(error.code, error.status);
      if (error instanceof TypeError && error.message === "local_fixture_lost_response") throw error;
      return failure("invalid_input", 422);
    }
  };
  return { fetch: fetchLocal, scopeKey, recoveryMarker, snapshot: () => clone({ sales: [...sales.values()], products, customers, requests, operations: operations.size }) };
}
