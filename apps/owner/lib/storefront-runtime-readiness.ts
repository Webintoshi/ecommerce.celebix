import "server-only";

export interface StorefrontRuntimeReadiness {
  checkedAt: string;
  storefrontRuntimeOk: boolean;
  homepageOk: boolean;
  categoriesOk: boolean;
  productsOk: boolean;
  dataApisOk: boolean;
  lastError: string | null;
}

const STOREFRONT_HEALTH_TIMEOUT_MS = 5000;

function trimErrorText(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 220);
}

function resolveBaseUrl(domainOrUrl: string | null | undefined): string | null {
  if (typeof domainOrUrl !== "string" || domainOrUrl.trim().length === 0) {
    return null;
  }

  const trimmed = domainOrUrl.trim();

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed.replace(/\/+$/, "");
  }

  return `https://${trimmed.replace(/\/+$/, "")}`;
}

async function probeRoute(
  baseUrl: string,
  pathname: string,
): Promise<{ ok: boolean; error: string | null }> {
  try {
    const response = await fetch(`${baseUrl}${pathname}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(STOREFRONT_HEALTH_TIMEOUT_MS),
    });

    if (response.ok) {
      return { ok: true, error: null };
    }

    const responseText = trimErrorText(await response.text().catch(() => response.statusText));
    return {
      ok: false,
      error: `${pathname} -> HTTP ${response.status}: ${responseText || response.statusText}`,
    };
  } catch (error) {
    return {
      ok: false,
      error: `${pathname} -> ${error instanceof Error ? trimErrorText(error.message) : "bilinmeyen fetch hatasi"}`,
    };
  }
}

export async function readStorefrontRuntimeReadiness(
  domainOrUrl: string | null | undefined,
): Promise<StorefrontRuntimeReadiness> {
  const checkedAt = new Date().toISOString();
  const baseUrl = resolveBaseUrl(domainOrUrl);

  if (!baseUrl) {
    return {
      checkedAt,
      storefrontRuntimeOk: false,
      homepageOk: false,
      categoriesOk: false,
      productsOk: false,
      dataApisOk: false,
      lastError: "Storefront domain authority eksik.",
    };
  }

  const runtime = await probeRoute(baseUrl, "/api/public/runtime");

  if (!runtime.ok) {
    return {
      checkedAt,
      storefrontRuntimeOk: false,
      homepageOk: false,
      categoriesOk: false,
      productsOk: false,
      dataApisOk: false,
      lastError: runtime.error,
    };
  }

  const [homepage, categories, products] = await Promise.all([
    probeRoute(baseUrl, "/api/homepage"),
    probeRoute(baseUrl, "/api/categories"),
    probeRoute(baseUrl, "/api/products?limit=1"),
  ]);

  const errors = [homepage.error, categories.error, products.error].filter(
    (value): value is string => Boolean(value),
  );

  return {
    checkedAt,
    storefrontRuntimeOk: true,
    homepageOk: homepage.ok,
    categoriesOk: categories.ok,
    productsOk: products.ok,
    dataApisOk: homepage.ok && categories.ok && products.ok,
    lastError: errors[0] ?? null,
  };
}
