const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const PRODUCT = new RegExp(`^/stores/(${UUID})/products/(${UUID})/(${UUID})\\.(jpg|png|webp)$`);
const CONTENT = new RegExp(`^/stores/(${UUID})/content/(${UUID})/(${UUID})\\.(jpg|png|webp)$`);
const UNSAFE = /[%\\\u0000-\u001f\u007f]/;

export type PublicMediaKey = Readonly<{
  kind: "product" | "content";
  key: string;
}>;

export function parsePublicMediaKey(pathname: string): PublicMediaKey | null {
  if (typeof pathname !== "string" || pathname.length < 1 || pathname.length > 512 || pathname !== pathname.trim() || UNSAFE.test(pathname) || pathname.includes("//") || pathname.includes("/./") || pathname.includes("/../")) return null;
  const kind = PRODUCT.test(pathname) ? "product" : CONTENT.test(pathname) ? "content" : null;
  if (!kind) return null;
  return Object.freeze({ kind, key: pathname.slice(1) });
}
