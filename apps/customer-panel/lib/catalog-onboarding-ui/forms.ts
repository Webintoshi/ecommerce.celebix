import {
  parseCatalogOnboardingIntent,
  type CatalogAdvancedCreateIntent,
  type CatalogQuickCreateIntent,
} from "@celebix/saas-contracts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;
const TURKISH_MONEY = /^(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{1,2})?$/;

export type CatalogFormResult<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; error: string }>;

export type QuickCreateFormInput = Readonly<{
  title: string;
  price: string;
  publish: boolean;
  stockQuantity?: string;
  categoryId?: string;
}>;

function invalid<T>(error: string): CatalogFormResult<T> {
  return Object.freeze({ ok: false, error });
}

function valid<T>(value: T): CatalogFormResult<T> {
  return Object.freeze({ ok: true, value });
}

function record(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return null;
  return value as Record<string, unknown>;
}

function exactKeys(value: unknown, allowed: readonly string[], required: readonly string[]): value is Record<string, unknown> {
  const parsed = record(value);
  if (parsed === null || Object.getOwnPropertySymbols(parsed).length !== 0) return false;
  const keys = Object.keys(parsed);
  return required.every((key) => Object.hasOwn(parsed, key)) && keys.every((key) => allowed.includes(key));
}

export function parseTurkishMoneyToCents(value: unknown): number | null {
  if (typeof value !== "string" || value.length < 1 || value.length > 32 || value.trim() !== value || CONTROL.test(value) || !TURKISH_MONEY.test(value)) return null;
  const [whole, fraction = ""] = value.split(",");
  const normalizedWhole = whole!.replaceAll(".", "");
  const cents = Number(normalizedWhole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(cents) && cents >= 0 ? cents : null;
}

function stockQuantity(value: unknown): number | null {
  if (typeof value !== "string" || !/^(?:0|[1-9]\d{0,14})$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export function buildQuickCreateIntent(input: QuickCreateFormInput): CatalogFormResult<CatalogQuickCreateIntent> {
  if (!exactKeys(input, ["title", "price", "publish", "stockQuantity", "categoryId"], ["title", "price", "publish"])) {
    return invalid("Ürün bilgileri geçersiz.");
  }
  if (typeof input.title !== "string") return invalid("Ürün adı zorunludur.");
  const title = input.title.trim();
  if (title.length < 1 || title.length > 200 || CONTROL.test(title)) return invalid("Ürün adı zorunludur.");
  const priceCents = parseTurkishMoneyToCents(input.price);
  if (priceCents === null) return invalid("Geçerli bir satış fiyatı girin.");
  if (input.publish !== true && input.publish !== false) return invalid("Yayın tercihi geçersiz.");

  let quantity: number | undefined;
  if (input.stockQuantity !== undefined && input.stockQuantity !== "") {
    const parsed = stockQuantity(input.stockQuantity);
    if (parsed === null) return invalid("Stok adedi sıfır veya daha büyük olmalıdır.");
    quantity = parsed;
  }
  if (input.categoryId !== undefined && input.categoryId !== "" && !UUID.test(input.categoryId)) {
    return invalid("Kategori seçimi geçersiz.");
  }

  const candidate = {
    kind: "quick" as const,
    title,
    priceCents,
    publish: input.publish,
    ...(quantity === undefined ? {} : { stockQuantity: quantity }),
    ...(input.categoryId === undefined || input.categoryId === "" ? {} : { categoryId: input.categoryId }),
  };
  try { return valid(parseCatalogOnboardingIntent(candidate) as CatalogQuickCreateIntent); }
  catch { return invalid("Ürün bilgileri geçersiz."); }
}

export function buildAdvancedCreateIntent(input: CatalogAdvancedCreateIntent): CatalogFormResult<CatalogAdvancedCreateIntent> {
  try {
    const parsed = parseCatalogOnboardingIntent(input);
    return parsed.kind === "advanced" ? valid(parsed) : invalid("Gelişmiş ürün bilgileri geçersiz.");
  } catch { return invalid("Gelişmiş ürün bilgileri geçersiz."); }
}
