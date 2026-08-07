import type {
  StorefrontDesignFontCategory,
  StorefrontDesignFontOption,
  StorefrontDesignFontWeight,
} from "@celebix/saas-contracts";

const GOOGLE_FONTS_METADATA_URL = "https://fonts.google.com/metadata/fonts";
const FAMILY = /^[A-Za-z0-9][A-Za-z0-9 .&()+-]{0,119}$/;
const SUPPORTED_WEIGHTS = Object.freeze(["400", "500", "600", "700", "800"] as const);

export const MAX_STOREFRONT_FONT_RESULTS = 2_000;

function option(
  family: string,
  category: StorefrontDesignFontCategory,
  availableWeights: readonly StorefrontDesignFontWeight[],
): StorefrontDesignFontOption {
  return Object.freeze({ family, category, availableWeights: Object.freeze([...availableWeights]), source: "google" as const });
}

export const FEATURED_STOREFRONT_FONT_CATALOG: readonly StorefrontDesignFontOption[] = Object.freeze([
  option("Inter", "sans-serif", SUPPORTED_WEIGHTS),
  option("Manrope", "sans-serif", SUPPORTED_WEIGHTS),
  option("Plus Jakarta Sans", "sans-serif", SUPPORTED_WEIGHTS),
  option("DM Sans", "sans-serif", ["400", "500", "600", "700"]),
  option("Montserrat", "sans-serif", ["500", "600", "700", "800"]),
  option("Playfair Display", "serif", ["500", "600", "700"]),
  option("Cormorant Garamond", "serif", ["500", "600", "700"]),
  option("Fraunces", "serif", ["500", "600", "700"]),
  option("Lora", "serif", ["400", "500", "600", "700"]),
]);

export type StorefrontFontCatalogResult = Readonly<{
  fonts: readonly StorefrontDesignFontOption[];
  degraded: boolean;
}>;

type CatalogFetchInit = Readonly<{
  headers: Readonly<{ Accept: "application/json"; "User-Agent": "CelebixCustomerPanel/1.0" }>;
  next: Readonly<{ revalidate: 86400 }>;
}>;

export type StorefrontFontCatalogFetcher = (
  input: string,
  init: CatalogFetchInit,
) => Promise<Pick<Response, "ok" | "status" | "text">>;

type GoogleFontMetadata = Readonly<{
  familyMetadataList?: unknown;
}>;

function category(value: unknown): StorefrontDesignFontCategory {
  const normalized = typeof value === "string" ? value.trim().toLocaleLowerCase("en-US") : "";
  if (normalized.includes("handwriting")) return "handwriting";
  if (normalized.includes("mono")) return "monospace";
  if (normalized.includes("display")) return "display";
  if (normalized.includes("serif")) return normalized.includes("sans") ? "sans-serif" : "serif";
  return "sans-serif";
}

function weights(value: unknown): readonly StorefrontDesignFontWeight[] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return SUPPORTED_WEIGHTS;
  const discovered = new Set(
    Object.keys(value)
      .map((key) => key.replace(/[^0-9]/g, ""))
      .filter((weight): weight is StorefrontDesignFontWeight => SUPPORTED_WEIGHTS.includes(weight as StorefrontDesignFontWeight)),
  );
  return Object.freeze(SUPPORTED_WEIGHTS.filter((weight) => discovered.has(weight)));
}

function parse(payload: string): readonly (StorefrontDesignFontOption & Readonly<{ popularity: number }>)[] {
  const parsed = JSON.parse(payload.trim().replace(/^\)\]\}'\s*/, "")) as GoogleFontMetadata;
  if (!Array.isArray(parsed.familyMetadataList)) throw new TypeError("storefront_font_catalog_invalid");

  const seen = new Set<string>();
  const fonts: Array<StorefrontDesignFontOption & Readonly<{ popularity: number }>> = [];
  for (const value of parsed.familyMetadataList) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) continue;
    const record = value as Record<string, unknown>;
    if (typeof record.family !== "string") continue;
    const family = record.family.trim();
    if (!FAMILY.test(family) || seen.has(family)) continue;
    const availableWeights = weights(record.fonts);
    if (!availableWeights.length) continue;
    seen.add(family);
    fonts.push(Object.freeze({
      ...option(family, category(record.category), availableWeights),
      popularity: typeof record.popularity === "number" && Number.isSafeInteger(record.popularity) && record.popularity >= 0
        ? record.popularity
        : Number.MAX_SAFE_INTEGER,
    }));
  }
  if (!fonts.length) throw new TypeError("storefront_font_catalog_empty");
  return Object.freeze(fonts
    .sort((left, right) => left.popularity - right.popularity || left.family.localeCompare(right.family, "en"))
    .slice(0, MAX_STOREFRONT_FONT_RESULTS));
}

function fallback(): StorefrontFontCatalogResult {
  return Object.freeze({ fonts: FEATURED_STOREFRONT_FONT_CATALOG, degraded: true });
}

export async function loadStorefrontFontCatalog(fetcher: StorefrontFontCatalogFetcher): Promise<StorefrontFontCatalogResult> {
  try {
    const response = await fetcher(GOOGLE_FONTS_METADATA_URL, {
      headers: { Accept: "application/json", "User-Agent": "CelebixCustomerPanel/1.0" },
      next: { revalidate: 86400 },
    });
    if (!response.ok || response.status !== 200) return fallback();
    const fonts = parse(await response.text()).map(({ popularity: _popularity, ...font }) => option(font.family, font.category, font.availableWeights));
    return Object.freeze({ fonts: Object.freeze(fonts), degraded: false });
  } catch {
    return fallback();
  }
}
