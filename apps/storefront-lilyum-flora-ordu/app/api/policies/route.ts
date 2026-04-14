import { NextRequest, NextResponse } from "next/server";
import { DEFAULT_LOCALE, isSupportedLocale } from "@/lib/i18n";
import { getPublishedPolicyLinks } from "@/lib/policy-pages";
import { getRequestLocale } from "@/lib/request-locale";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const requestedLocale = searchParams.get("locale");
  const locale = isSupportedLocale(requestedLocale)
    ? requestedLocale
    : await getRequestLocale();

  const pages = await getPublishedPolicyLinks(locale || DEFAULT_LOCALE);
  return NextResponse.json(
    { success: true, pages },
    { headers: { "Cache-Control": "no-store" } },
  );
}
