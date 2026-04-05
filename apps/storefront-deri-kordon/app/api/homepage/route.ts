import { NextRequest, NextResponse } from "next/server";
import { getHomepageData } from "@/lib/homepage";
import { DEFAULT_LOCALE, isSupportedLocale } from "@/lib/i18n";
import { getRequestLocale } from "@/lib/request-locale";

export async function GET(request: NextRequest) {
    try {
        const requestedLocale = request.nextUrl.searchParams.get("locale");
        const locale =
            (requestedLocale && isSupportedLocale(requestedLocale) ? requestedLocale : null) ||
            (await getRequestLocale()) ||
            DEFAULT_LOCALE;
        const homepageData = await getHomepageData(locale);

        return NextResponse.json({
            ...homepageData,
            locale,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error("Homepage data API error:", error);
        return NextResponse.json(
            { error: "Failed to fetch homepage data" },
            { status: 500 }
        );
    }
}
