import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApiAuth } from "@/lib/admin-api-auth";
import { probeCatalogTranslationHealth } from "@/lib/admin/catalog-translation-warmup";
import { STORE_TRANSLATION_LOCALES, type StoreTranslationLocale } from "@celebix/platform-config/src/translation";

const localeOptions = STORE_TRANSLATION_LOCALES.filter((locale) => locale !== "tr") as [
  StoreTranslationLocale,
  ...StoreTranslationLocale[],
];

const requestSchema = z.object({
  locale: z.enum(localeOptions),
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
          error: "Gecersiz saglik kontrolu istegi.",
          details: parsed.error.flatten(),
        },
        { status: 422 },
      );
    }

    const summary = await probeCatalogTranslationHealth(parsed.data.locale);

    return NextResponse.json({
      success: true,
      summary,
    });
  } catch (error) {
    console.error("Catalog translation health check failed:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Katalog saglik kontrolu basarisiz.",
      },
      { status: 500 },
    );
  }
}
