import type { ToshiDestination, ToshiLocalIntent } from "./types.ts";

const UNSUPPORTED: ToshiLocalIntent = Object.freeze({ kind: "unsupported" });

type Matcher = (normalized: string, input: string) => readonly ToshiLocalIntent[] | null;

const SEARCH_PREFIX = /^(?:müşteri\s+bul|ürün\s+ara|sipariş\s+bul)\s+/u;
const UNSAFE_OR_AMBIGUOUS_QUERY = /(?:^|\s)(?:mağaza\s+özeti|bekleyen\s+siparişler|düşük\s+stok|müşteri\s+bul|ürün\s+ara|sipariş\s+bul|ürünlere\s+git|siparişlere\s+git|müşterilere\s+git|ana\s+sayfaya\s+git|sil|silme|silmek|iptal|güncelle|değiştir|ekle|oluştur|kaldır|gönder|iade|ap[iı][\s._-]*(?:anahtar\S*|key\S*)|secret|token|şifre)(?:\s|\p{P}|$)/u;

function record(intent: ToshiLocalIntent): readonly ToshiLocalIntent[] {
  return Object.freeze([Object.freeze(intent)]);
}

function query(input: string): string | null {
  const value = input.replace(/^(?:\S+\s+){2}/u, "").trim();
  return value && value.length <= 120 && !/[\u0000-\u001F\u007F]/u.test(value) ? value : null;
}

function find(kind: "find_order" | "find_customer" | "find_product", normalized: string, input: string, pattern: RegExp): readonly ToshiLocalIntent[] | null {
  if (!pattern.test(normalized)) return null;
  const value = query(input);
  return value ? record({ kind, query: value }) : null;
}

function navigate(destination: ToshiDestination): Matcher {
  return (normalized) => normalized === `${destination === "/products" ? "ürünlere" : destination === "/orders" ? "siparişlere" : destination === "/customers" ? "müşterilere" : "ana sayfaya"} git`
    ? record({ kind: "navigate", destination })
    : null;
}

function isUnsafeOrAmbiguous(normalized: string): boolean {
  return SEARCH_PREFIX.test(normalized) && UNSAFE_OR_AMBIGUOUS_QUERY.test(normalized.replace(SEARCH_PREFIX, ""));
}

const MATCHERS: readonly Matcher[] = Object.freeze([
  (normalized) => normalized === "mağaza özeti" ? record({ kind: "store_summary" }) : null,
  (normalized) => normalized === "bekleyen siparişler" ? record({ kind: "pending_orders" }) : null,
  (normalized) => normalized === "düşük stok" ? record({ kind: "low_stock" }) : null,
  (normalized, input) => find("find_customer", normalized, input, /^müşteri\s+bul\s+(.+)$/u),
  (normalized, input) => find("find_product", normalized, input, /^ürün\s+ara\s+(.+)$/u),
  (normalized, input) => find("find_order", normalized, input, /^sipariş\s+bul\s+(.+)$/u),
  navigate("/products"),
  navigate("/orders"),
  navigate("/customers"),
  navigate("/"),
]);

export function parseToshiLocalIntent(input: unknown): ToshiLocalIntent {
  if (typeof input !== "string" || input !== input.trim() || input.length < 1 || input.length > 500 || /[\u0000-\u001F\u007F]/u.test(input)) {
    return UNSUPPORTED;
  }
  const normalized = input.toLocaleLowerCase("tr-TR").replace(/\s+/gu, " ");
  if (isUnsafeOrAmbiguous(normalized)) return UNSUPPORTED;
  const matches = MATCHERS.flatMap((matcher) => matcher(normalized, input) ?? []);
  return matches.length === 1 ? matches[0]! : UNSUPPORTED;
}
