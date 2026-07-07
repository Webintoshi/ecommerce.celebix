const TURKISH_CHAR_MAP: Record<string, string> = {
  ç: "c",
  Ç: "c",
  ğ: "g",
  Ğ: "g",
  ı: "i",
  I: "i",
  İ: "i",
  ö: "o",
  Ö: "o",
  ş: "s",
  Ş: "s",
  ü: "u",
  Ü: "u",
};

const RESERVED_SELF_SERVE_SLUGS = new Set([
  "admin",
  "api",
  "app",
  "auth",
  "blog",
  "celebix",
  "checkout",
  "dashboard",
  "login",
  "logout",
  "magaza",
  "magaza-ac",
  "new",
  "onboarding",
  "owner",
  "panel",
  "root",
  "store",
  "stores",
  "support",
  "www",
]);

export const SELF_SERVE_SLUG_MIN_LENGTH = 3;
export const SELF_SERVE_SLUG_MAX_LENGTH = 48;

export function normalizeSelfServeStoreSlug(input: string): string {
  const transliterated = input
    .trim()
    .split("")
    .map((char) => TURKISH_CHAR_MAP[char] ?? char)
    .join("");

  return transliterated
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, SELF_SERVE_SLUG_MAX_LENGTH)
    .replace(/-+$/g, "");
}

export function isReservedSelfServeSlug(slug: string): boolean {
  return RESERVED_SELF_SERVE_SLUGS.has(slug);
}

export function suggestSelfServeStoreSlug(storeName: string): string {
  const normalized = normalizeSelfServeStoreSlug(storeName);

  if (!normalized) {
    return "";
  }

  const lengthSafe =
    normalized.length >= SELF_SERVE_SLUG_MIN_LENGTH
      ? normalized
      : `${normalized}-store`.slice(0, SELF_SERVE_SLUG_MAX_LENGTH).replace(/-+$/g, "");

  return isReservedSelfServeSlug(lengthSafe) ? `${lengthSafe}-store` : lengthSafe;
}

export function getSelfServeSlugIssue(slug: string): string | null {
  if (!slug) {
    return "Magaza slug onerisi olusturulamadi.";
  }

  if (slug.length < SELF_SERVE_SLUG_MIN_LENGTH) {
    return `Slug en az ${SELF_SERVE_SLUG_MIN_LENGTH} karakter olmali.`;
  }

  if (slug.length > SELF_SERVE_SLUG_MAX_LENGTH) {
    return `Slug en fazla ${SELF_SERVE_SLUG_MAX_LENGTH} karakter olmali.`;
  }

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    return "Slug sadece kucuk harf, rakam ve tire icerebilir.";
  }

  if (isReservedSelfServeSlug(slug)) {
    return "Bu slug platform tarafindan ayrilmis.";
  }

  return null;
}
