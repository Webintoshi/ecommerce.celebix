import "server-only";

import {
  diagnoseGeneratedRuntimeFailure,
  type GeneratedRuntimeIssueCode,
} from "@/lib/generated-runtime-readiness";

export interface StorefrontRuntimeReadiness {
  checkedAt: string;
  storefrontRuntimeOk: boolean;
  homepageOk: boolean;
  categoriesOk: boolean;
  productsOk: boolean;
  dataApisOk: boolean;
  probeState: "ok" | GeneratedRuntimeIssueCode;
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
): Promise<{ ok: boolean; error: string | null; statusCode: number | null }> {
  try {
    const response = await fetch(`${baseUrl}${pathname}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(STOREFRONT_HEALTH_TIMEOUT_MS),
    });

    if (response.ok) {
      return { ok: true, error: null, statusCode: response.status };
    }

    const responseText = trimErrorText(await response.text().catch(() => response.statusText));
    return {
      ok: false,
      error: `${pathname} -> HTTP ${response.status}: ${responseText || response.statusText}`,
      statusCode: response.status,
    };
  } catch (error) {
    return {
      ok: false,
      error: `${pathname} -> ${error instanceof Error ? trimErrorText(error.message) : "bilinmeyen fetch hatasi"}`,
      statusCode: null,
    };
  }
}

export async function readStorefrontRuntimeReadiness(
  domainOrUrl: string | null | undefined,
  options: { resourceId?: string | null } = {},
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
      probeState: "runtime_unreachable",
      lastError: "Storefront domain authority eksik.",
    };
  }

  const runtime = await probeRoute(baseUrl, "/api/public/runtime");

  if (!runtime.ok) {
    const diagnosis = await diagnoseGeneratedRuntimeFailure({
      runtimeUrl: baseUrl,
      resourceId: options.resourceId ?? null,
      responseStatus: runtime.statusCode,
      errorMessage: runtime.error,
    });

    if (diagnosis?.internalHealthy) {
      return {
        checkedAt,
        storefrontRuntimeOk: true,
        homepageOk: false,
        categoriesOk: false,
        productsOk: false,
        dataApisOk: false,
        probeState: diagnosis.code,
        lastError: diagnosis.message,
      };
    }

    return {
      checkedAt,
      storefrontRuntimeOk: false,
      homepageOk: false,
      categoriesOk: false,
      productsOk: false,
      dataApisOk: false,
      probeState: diagnosis?.code ?? "runtime_unreachable",
      lastError: diagnosis?.message ?? runtime.error,
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
    probeState: "ok",
    lastError: errors[0] ?? null,
  };
}
