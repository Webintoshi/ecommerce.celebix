import { COUNT, COUNT_ID, LOCATIONS, LOCATION_ID, DESTINATION_ID, PURCHASE, PURCHASE_ID, TRANSFER, TRANSFER_ID, STOCK_NOW, VARIANT_CHOICE } from "../../mira-stock/stock-fixture";

/** Local memory only; never calls a merchant database or accepts external URLs. */
export function createStockFixtureTransport(origin: string, state: "loaded" | "readonly" | "error") {
  const choices = [VARIANT_CHOICE,
    { ...VARIANT_CHOICE, productId: "91000000-0000-4000-8000-000000000031", variantId: "91000000-0000-4000-8000-000000000021", productTitle: "Pamuklu Gömlek", variantTitle: "L / Beyaz", sku: "GM-BYZ-L" },
    { ...VARIANT_CHOICE, productId: "91000000-0000-4000-8000-000000000032", variantId: "91000000-0000-4000-8000-000000000022", productTitle: "Klasik Pantolon", variantTitle: "M / Siyah", sku: "PT-SYH-M" },
  ];
  const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
  const records: Record<string, Record<string, any>> = {
    counts: { [COUNT_ID]: clone(COUNT) },
    "purchase-orders": { [PURCHASE_ID]: clone(PURCHASE) },
    transfers: { [TRANSFER_ID]: clone(TRANSFER) },
  };
  const balances = new Map(LOCATIONS.map(({ id }) => [id, choices.slice(0, 2).map((choice, index) => ({ locationId: id, variantId: choice.variantId, quantity: id === LOCATION_ID ? index ? 0 : 8 : index ? 2 : 3, version: 1, updatedAt: STOCK_NOW }))]));
  function adjust(locationId: string, variantId: string, difference: number) {
    const entries = balances.get(locationId) ?? [];
    const existing = entries.find(item => item.variantId === variantId);
    if (existing) { existing.quantity += difference; existing.version += 1; }
    else entries.push({ locationId, variantId, quantity: difference, version: 1, updatedAt: STOCK_NOW });
    balances.set(locationId, entries);
  }
  const operations = new Map<string, unknown>();
  const reply = (value: unknown, status = 200) => Response.json(value, { status });
  async function fetcher(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const url = new URL(input instanceof Request ? input.url : String(input), origin);
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    if (url.origin !== origin || !url.pathname.startsWith("/api/")) return reply({ code: "forbidden" }, 403);
    if (state === "error") return reply({ code: "unavailable" }, 503);
    if (url.pathname === "/api/catalog/variant-choices" && method === "GET") return reply({ items: choices });
    if (url.pathname === "/api/inventory/locations" && method === "GET") return reply({ items: LOCATIONS });
    if (url.pathname === "/api/inventory/balances" && method === "GET") return reply({ items: balances.get(url.searchParams.get("locationId") ?? "") ?? [] });
    const parts = url.pathname.slice("/api/inventory/".length).split("/");
    const group = records[parts[0]!];
    if (!group) return reply({ code: "not_found" }, 404);
    if (method === "GET") return parts[1] ? group[parts[1]] ? reply(group[parts[1]]) : reply({ code: "not_found" }, 404) : reply({ items: Object.values(group) });
    if (method !== "POST") return reply({ code: "method_not_allowed" }, 405);
    if (state === "readonly") return reply({ code: "forbidden" }, 403);
    const body = JSON.parse(String(init?.body ?? "{}"));
    if (operations.has(body.operationId)) return reply({ ...(operations.get(body.operationId) as object), replayed: true });
    const key = parts[0] === "counts" ? "countId" : parts[0] === "purchase-orders" ? "orderId" : "transferId";
    const id = parts[1] ?? body[key] ?? crypto.randomUUID();
    const prior = group[id];
    if (prior && body.expectedVersion !== prior.version) return reply({ code: "conflict" }, 409);
    const version = prior ? prior.version + 1 : 1;
    let next = prior ? clone(prior) : { id, version, status: "draft", createdAt: STOCK_NOW, updatedAt: STOCK_NOW };
    if (!parts[2]) {
      const lines = body.lines.map((line: any) => parts[0] === "counts" ? {
        id: line.lineId, variantId: line.variantId,
        expectedQuantity: prior?.lines.find((item: any) => item.id === line.lineId)?.expectedQuantity ?? 0,
        ...(line.countedQuantity === undefined ? {} : { countedQuantity: line.countedQuantity }),
      } : parts[0] === "purchase-orders" ? {
        id: line.lineId, variantId: line.variantId, orderedQuantity: line.orderedQuantity, receivedQuantity: 0,
        unitCostCents: line.unitCostCents, lineCostCents: line.orderedQuantity * line.unitCostCents,
      } : { id: line.lineId, variantId: line.variantId, quantity: line.quantity });
      next = { ...next, ...("locationId" in body ? { locationId: body.locationId } : { sourceLocationId: body.sourceLocationId, destinationLocationId: body.destinationLocationId }), lines };
      if (parts[0] === "purchase-orders") next = { ...next, supplierName: body.supplierName, totalCostCents: lines.reduce((sum: number, line: any) => sum + line.lineCostCents, 0) };
    } else if (parts[2] === "start") {
      next.status = "counting";
      next.lines = next.lines.map((line: any) => ({ id: line.id, variantId: line.variantId, expectedQuantity: balances.get(next.locationId)?.find(item => item.variantId === line.variantId)?.quantity ?? 0 }));
    } else if (parts[2] === "commit") {
      next.status = "committed";
      next.lines.forEach((line: any) => { const balance = balances.get(next.locationId)?.find(item => item.variantId === line.variantId); if (balance) { balance.quantity = line.countedQuantity; balance.version += 1; } });
    } else if (parts[2] === "transition") next.status = body.transition === "order" ? "ordered" : "cancelled";
    else if (parts[2] === "dispatch") {
      next.status = "in_transit";
      next.lines.forEach((line: any) => adjust(next.sourceLocationId, line.variantId, -line.quantity));
    }
    else if (parts[2] === "receive" && parts[0] === "purchase-orders") {
      next.lines.forEach((line: any) => {
        const quantity = body.lines.find((item: any) => item.lineId === line.id)?.quantity ?? 0;
        line.receivedQuantity += quantity;
        if (quantity > 0) adjust(next.locationId, line.variantId, quantity);
      });
      next.status = next.lines.every((line: any) => line.receivedQuantity === line.orderedQuantity) ? "received" : "partially_received";
    } else if (parts[2] === "receive") {
      next.status = "received";
      next.lines.forEach((line: any) => adjust(next.destinationLocationId, line.variantId, line.quantity));
    } else if (parts[2] === "cancel") {
      if (next.status === "in_transit") next.lines.forEach((line: any) => adjust(next.sourceLocationId, line.variantId, line.quantity));
      next.status = "cancelled";
    }
    else return reply({ code: "not_found" }, 404);
    next.version = version;
    group[id] = next;
    const result = { kind: parts[0] === "counts" ? "inventory_count" : parts[0] === "purchase-orders" ? "purchase_order" : "inventory_transfer", id, status: next.status, version, updatedAt: STOCK_NOW, replayed: false };
    operations.set(body.operationId, result);
    return reply(result);
  }
  return { fetch: fetcher };
}
