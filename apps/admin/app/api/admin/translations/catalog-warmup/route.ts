import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApiAuth } from "@/lib/admin-api-auth";
import {
  warmCatalogTranslations,
  type CatalogTranslationWarmupScope,
} from "@/lib/admin/catalog-translation-warmup";
import { STORE_TRANSLATION_LOCALES, type StoreTranslationLocale } from "@celebix/platform-config/src/translation";

const localeOptions = STORE_TRANSLATION_LOCALES.filter((locale) => locale !== "tr") as [
  StoreTranslationLocale,
  ...StoreTranslationLocale[],
];

const requestSchema = z.object({
  locale: z.enum(localeOptions),
  scope: z.enum(["products", "categories", "all"]).default("all"),
});

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const authResult = await requireAdminApiAuth();
  if (authResult.response) {
    return authResult.response;
  }

  try {
    const body = await request.json().catch(() => null);
    const parsed = requestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Gecersiz warm-up istegi.",
          details: parsed.error.flatten(),
        },
        { status: 422 },
      );
    }

    const summary = await warmCatalogTranslations(
      parsed.data.locale,
      parsed.data.scope as CatalogTranslationWarmupScope,
    );

    return NextResponse.json({
      success: true,
      summary,
    });
  } catch (error) {
    console.error("Catalog translation warm-up failed:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Katalog warm-up basarisiz.",
      },
      { status: 500 },
    );
  }
}
