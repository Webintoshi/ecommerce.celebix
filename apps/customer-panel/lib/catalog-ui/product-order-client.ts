const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export type CategoryProductOrderItem = Readonly<{
  productId: string;
  title: string;
  slug: string;
  status: "active" | "draft" | "archived";
  storefrontPosition: number | null;
}>;

export type CategoryProductOrder = Readonly<{
  categoryId: string;
  version: number;
  items: readonly CategoryProductOrderItem[];
}>;

export class ProductOrderError extends Error {
  constructor(readonly code: string, readonly status: number) {
    super(code === "version_conflict" || code === "order_membership_changed"
      ? "Kategori sizden önce değişti. Güncel sırayı yükleyin."
      : code === "order_limit_exceeded"
        ? "Bu kategoride sıralama sınırını aşan sayıda ürün var."
        : code === "category_not_found"
          ? "Kategori artık kullanılamıyor."
          : code === "membership_denied"
            ? "Bu mağazada ürün sıralama yetkiniz yok."
            : "Vitrin sırası yüklenemedi. Yeniden deneyin.");
    this.name = "ProductOrderError";
  }
}

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function parseOrder(value: unknown): CategoryProductOrder {
  const body = object(value);
  if (!body || typeof body.categoryId !== "string" || !UUID.test(body.categoryId)
    || !Number.isSafeInteger(body.version) || (body.version as number) < 0 || !Array.isArray(body.items)) {
    throw new ProductOrderError("unavailable", 503);
  }
  const seen = new Set<string>();
  const items = body.items.map((raw): CategoryProductOrderItem => {
    const item = object(raw);
    if (!item || typeof item.productId !== "string" || !UUID.test(item.productId) || seen.has(item.productId)
      || typeof item.title !== "string" || item.title.trim() === "" || typeof item.slug !== "string"
      || !["active", "draft", "archived"].includes(String(item.status))
      || (item.storefrontPosition !== null && (!Number.isSafeInteger(item.storefrontPosition) || (item.storefrontPosition as number) < 0))) {
      throw new ProductOrderError("unavailable", 503);
    }
    seen.add(item.productId);
    return Object.freeze({
      productId: item.productId,
      title: item.title,
      slug: item.slug,
      status: item.status as CategoryProductOrderItem["status"],
      storefrontPosition: item.storefrontPosition as number | null,
    });
  });
  return Object.freeze({ categoryId: body.categoryId, version: body.version as number, items: Object.freeze(items) });
}

async function request(response: Response): Promise<CategoryProductOrder> {
  if (!response.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    throw new ProductOrderError("unavailable", response.status || 503);
  }
  let body: unknown;
  try { body = await response.json(); }
  catch { throw new ProductOrderError("unavailable", response.status || 503); }
  if (!response.ok) {
    const code = object(body)?.code;
    throw new ProductOrderError(typeof code === "string" ? code : "unavailable", response.status);
  }
  return parseOrder(body);
}

function categoryPath(categoryId: string): string {
  if (!UUID.test(categoryId)) throw new TypeError("category_order_invalid_id");
  return `/api/catalog/onboarding/categories/${categoryId}/product-order`;
}

export function createProductOrderClient(fetchImpl: typeof fetch = fetch, randomUUID = () => crypto.randomUUID()) {
  return Object.freeze({
    async get(categoryId: string, signal?: AbortSignal): Promise<CategoryProductOrder> {
      return request(await fetchImpl(categoryPath(categoryId), {
        method: "GET", credentials: "same-origin", cache: "no-store", ...(signal ? { signal } : {}),
      }));
    },
    async save(categoryId: string, expectedVersion: number, orderedProductIds: readonly string[]): Promise<CategoryProductOrder> {
      if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0
        || orderedProductIds.some((id) => !UUID.test(id)) || new Set(orderedProductIds).size !== orderedProductIds.length) {
        throw new TypeError("category_order_invalid_input");
      }
      const operationId = randomUUID();
      if (!UUID.test(operationId)) throw new TypeError("category_order_invalid_operation");
      return request(await fetchImpl(categoryPath(categoryId), {
        method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { "content-type": "application/json", "idempotency-key": operationId },
        body: JSON.stringify({ expectedVersion, orderedProductIds }),
      }));
    },
  });
}

export const productOrderClient = createProductOrderClient();

export function moveProductOrder<T>(items: readonly T[], fromIndex: number, toIndex: number): readonly T[] {
  if (!Number.isInteger(fromIndex) || !Number.isInteger(toIndex)
    || fromIndex < 0 || toIndex < 0 || fromIndex >= items.length || toIndex >= items.length || fromIndex === toIndex) return items;
  const moved = [...items];
  const [item] = moved.splice(fromIndex, 1);
  moved.splice(toIndex, 0, item);
  return Object.freeze(moved);
}
