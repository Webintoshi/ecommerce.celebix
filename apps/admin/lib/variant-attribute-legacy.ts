const IGNORED_LEGACY_GROUP_NAMES = new Set([
  "adet",
  "kg",
  "g",
  "gr",
  "gram",
  "lt",
  "l",
  "ml",
  "paket",
  "kutu",
  "default title",
  "varsayilan baslik",
  "standart",
  "standard",
]);

export function normalizeVariantAttributeToken(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isIgnoredLegacyVariantAttributeName(value: string | null | undefined): boolean {
  return Boolean(value && IGNORED_LEGACY_GROUP_NAMES.has(normalizeVariantAttributeToken(value)));
}
