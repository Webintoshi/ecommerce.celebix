import { STORE_RUNTIME } from "@/lib/store-runtime";

function normalizeSkuSource(value: string | undefined): string {
  return (value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u0131/g, "i")
    .replace(/[^a-z]/g, "");
}

function hashSkuContext(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) % 1_000_000;
  }

  return String(hash).padStart(6, "0");
}

export function buildStoreSkuPrefix(input?: { slug?: string; name?: string }): string {
  const source = normalizeSkuSource(input?.slug || STORE_RUNTIME.slug) || normalizeSkuSource(input?.name || STORE_RUNTIME.name);

  if (!source) {
    return "SKU";
  }

  const firstLetter = source.charAt(0).toUpperCase();
  const remaining = source.slice(1).toUpperCase();
  const consonants = remaining.replace(/[AEIOU]/g, "");
  const vowels = remaining.replace(/[^AEIOU]/g, "");

  const prefix = `${firstLetter}${consonants}${vowels}SKU`.slice(0, 3);
  return prefix.padEnd(3, "X");
}

export function buildGeneratedSku(options?: {
  slug?: string;
  name?: string;
  context?: string;
  index?: number;
}): string {
  const prefix = buildStoreSkuPrefix({ slug: options?.slug, name: options?.name });
  const baseSequence = options?.context
    ? hashSkuContext(options.context)
    : Date.now().toString().slice(-6);

  const indexSuffix =
    typeof options?.index === "number" && options.index >= 0
      ? String(options.index + 1).padStart(2, "0")
      : "";

  return `${prefix}-${baseSequence}${indexSuffix}`;
}
