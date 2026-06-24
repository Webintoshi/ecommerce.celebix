export const SELF_SERVE_STORE_SLUG_MIN_LENGTH = 3;
export const SELF_SERVE_STORE_SLUG_MAX_LENGTH = 63;

export const SELF_SERVE_RESERVED_SLUGS = [
  "admin",
  "api",
  "www",
  "app",
  "panel",
  "accounts",
  "login",
  "logout",
  "support",
  "help",
  "billing",
  "checkout",
  "store",
  "stores",
  "owner",
  "root",
  "system",
  "celebi",
  "celebix",
  "derycraft",
  "hemenaku",
] as const;

const RESERVED_SLUG_SET = new Set<string>(SELF_SERVE_RESERVED_SLUGS);

const TURKISH_CHARACTER_MAP: Record<string, string> = {
  "ç": "c",
  "Ç": "c",
  "ğ": "g",
  "Ğ": "g",
  "ı": "i",
  "I": "i",
  "İ": "i",
  "ö": "o",
  "Ö": "o",
  "ş": "s",
  "Ş": "s",
  "ü": "u",
  "Ü": "u",
};

export interface SelfServeSlugValidationResult {
  input: string;
  slug: string;
  valid: boolean;
  errors: string[];
  reserved: boolean;
}

export function normalizeSelfServeStoreSlug(input: string): string {
  return input
    .trim()
    .replace(/[çÇğĞıIİöÖşŞüÜ]/g, (character) => TURKISH_CHARACTER_MAP[character] ?? character)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function isSelfServeReservedSlug(slug: string): boolean {
  return RESERVED_SLUG_SET.has(slug);
}

export function validateSelfServeStoreSlug(input: string): SelfServeSlugValidationResult {
  const slug = normalizeSelfServeStoreSlug(input);
  const errors: string[] = [];
  const reserved = isSelfServeReservedSlug(slug);

  if (!slug) {
    errors.push("Slug zorunludur.");
  }

  if (slug.length > 0 && slug.length < SELF_SERVE_STORE_SLUG_MIN_LENGTH) {
    errors.push(`Slug en az ${SELF_SERVE_STORE_SLUG_MIN_LENGTH} karakter olmalıdır.`);
  }

  if (slug.length > SELF_SERVE_STORE_SLUG_MAX_LENGTH) {
    errors.push(`Slug en fazla ${SELF_SERVE_STORE_SLUG_MAX_LENGTH} karakter olabilir.`);
  }

  if (slug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    errors.push("Slug sadece lowercase harf, rakam ve arada tire içerebilir.");
  }

  if (reserved) {
    errors.push("Bu slug platform tarafından rezerve edilmiştir.");
  }

  return {
    input,
    slug,
    valid: errors.length === 0,
    errors,
    reserved,
  };
}
