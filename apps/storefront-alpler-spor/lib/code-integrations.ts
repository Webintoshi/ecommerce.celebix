export interface StoreCodeIntegrationsSettings {
  googleTagManagerId: string;
  googleSearchConsoleVerification: string;
  metaPixelId: string;
  customHeadHtml: string;
  customBodyEndHtml: string;
}

export const DEFAULT_STORE_CODE_INTEGRATIONS_SETTINGS: StoreCodeIntegrationsSettings = {
  googleTagManagerId: "",
  googleSearchConsoleVerification: "",
  metaPixelId: "",
  customHeadHtml: "",
  customBodyEndHtml: "",
};

const GTM_ID_REGEX = /\bGTM-[A-Z0-9]+\b/i;
const META_PIXEL_ID_REGEX = /\b\d{5,}\b/;
const META_PIXEL_SNIPPET_REGEX = /fbq\(\s*['"]init['"]\s*,\s*['"](\d{5,})['"]\s*\)/i;
const SEARCH_CONSOLE_META_REGEX =
  /<meta[^>]*name=["']google-site-verification["'][^>]*content=["']([^"']+)["'][^>]*>/i;

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function extractGoogleTagManagerId(value: unknown) {
  const raw = normalizeString(value);
  if (!raw) {
    return "";
  }

  const match = raw.match(GTM_ID_REGEX);
  return match ? match[0].toUpperCase() : raw.toUpperCase();
}

function extractGoogleSearchConsoleVerification(value: unknown) {
  const raw = normalizeString(value);
  if (!raw) {
    return "";
  }

  const metaMatch = raw.match(SEARCH_CONSOLE_META_REGEX);
  if (metaMatch?.[1]) {
    return metaMatch[1].trim();
  }

  const contentMatch = raw.match(/content=["']([^"']+)["']/i);
  if (raw.includes("google-site-verification") && contentMatch?.[1]) {
    return contentMatch[1].trim();
  }

  return raw;
}

function extractMetaPixelId(value: unknown) {
  const raw = normalizeString(value);
  if (!raw) {
    return "";
  }

  const initMatch = raw.match(META_PIXEL_SNIPPET_REGEX);
  if (initMatch?.[1]) {
    return initMatch[1];
  }

  const genericMatch = raw.match(META_PIXEL_ID_REGEX);
  return genericMatch ? genericMatch[0] : raw;
}

export function normalizeStoreCodeIntegrationsSettings(
  value?: Partial<StoreCodeIntegrationsSettings> | null,
  fallback?: Partial<StoreCodeIntegrationsSettings> | null,
): StoreCodeIntegrationsSettings {
  const merged = {
    ...DEFAULT_STORE_CODE_INTEGRATIONS_SETTINGS,
    ...(fallback || {}),
    ...(value || {}),
  };

  return {
    googleTagManagerId: extractGoogleTagManagerId(merged.googleTagManagerId),
    googleSearchConsoleVerification: extractGoogleSearchConsoleVerification(
      merged.googleSearchConsoleVerification,
    ),
    metaPixelId: extractMetaPixelId(merged.metaPixelId),
    customHeadHtml: normalizeString(merged.customHeadHtml),
    customBodyEndHtml: normalizeString(merged.customBodyEndHtml),
  };
}
