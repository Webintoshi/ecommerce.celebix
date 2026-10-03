/** Server-owned identities; names and content remain editable. */
export const REQUIRED_STORE_PAGES = Object.freeze([
  Object.freeze({ key: "about", label: "Hakkımızda" }),
  Object.freeze({ key: "contact", label: "İletişim" }),
  Object.freeze({ key: "blog", label: "Blog" }),
] as const);

export type RequiredPageKey = (typeof REQUIRED_STORE_PAGES)[number]["key"];

export function parseRequiredPageKey(value: unknown): RequiredPageKey {
  if (typeof value !== "string" || !REQUIRED_STORE_PAGES.some(page => page.key === value)) {
    throw new TypeError("required_page_key_invalid");
  }
  return value as RequiredPageKey;
}
