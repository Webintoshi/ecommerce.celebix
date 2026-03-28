import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit, getRequestIp } from "@/lib/api-rate-limit";
import {
  isMarketplaceProvider,
  parseMarketplaceCredentials,
} from "@/lib/marketplace-providers";
import type { MarketplaceProvider, MarketplaceProviderCredentials } from "@/types/marketplace";

export const marketplaceConnectionSchema = z.object({
  credentials: z.record(z.string(), z.string()).default({}),
  settings: z.record(z.string(), z.unknown()).default({}),
  fieldMappings: z.record(z.string(), z.string()).default({}),
});

export const marketplaceManualSyncSchema = z.object({
  provider: z.string().optional(),
  forceOrders: z.boolean().optional(),
  forceReconciliation: z.boolean().optional(),
});

export function getMarketplaceProviderOrResponse(provider: string) {
  if (!isMarketplaceProvider(provider)) {
    return NextResponse.json({ success: false, error: "Gecersiz pazaryeri." }, { status: 404 });
  }

  return provider as MarketplaceProvider;
}

export function enforceMarketplaceRateLimit(
  request: NextRequest,
  suffix: string,
  limit = 30,
  windowMs = 60_000,
) {
  const ip = getRequestIp(request);
  const result = checkRateLimit({
    key: `marketplace:${suffix}:${ip}`,
    limit,
    windowMs,
  });

  if (result.allowed) {
    return null;
  }

  return NextResponse.json(
    {
      success: false,
      error: "Rate limit asildi. Lutfen biraz sonra tekrar deneyin.",
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000))),
      },
    },
  );
}

export function parseMarketplaceConnectionForProvider(
  provider: MarketplaceProvider,
  body: unknown,
): {
  success: true;
  data: {
    credentials: MarketplaceProviderCredentials;
    settings: Record<string, unknown>;
    fieldMappings: Record<string, string>;
  };
} | {
  success: false;
  status: 422;
  payload: Record<string, unknown>;
} {
  const parsedBody = marketplaceConnectionSchema.safeParse(body);
  if (!parsedBody.success) {
    return {
      success: false,
      status: 422,
      payload: {
        success: false,
        error: "Baglanti verisi gecersiz.",
        details: parsedBody.error.flatten(),
      },
    };
  }

  const parsedCredentials = parseMarketplaceCredentials(provider, parsedBody.data.credentials);
  if (!parsedCredentials.success) {
    return {
      success: false,
      status: 422,
      payload: {
        success: false,
        error: "Credential verisi gecersiz.",
        details: parsedCredentials.error.flatten(),
      },
    };
  }

  return {
    success: true,
    data: {
      credentials: parsedCredentials.credentials,
      settings: parsedBody.data.settings,
      fieldMappings: parsedBody.data.fieldMappings,
    },
  };
}
