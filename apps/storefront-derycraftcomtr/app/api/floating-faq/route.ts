import { NextResponse } from "next/server";
import { getPublishedManagedContentPage } from "@/lib/content-pages";
import { resolveFloatingFaqItems } from "@/lib/floating-faq";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const managedPage = await getPublishedManagedContentPage("sss");
    const items = resolveFloatingFaqItems(managedPage?.contentHtml);

    return NextResponse.json(
      {
        success: true,
        items,
        source: managedPage?.contentHtml ? "admin-sss" : "default",
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=120, stale-while-revalidate=300",
        },
      },
    );
  } catch (error) {
    console.error("[floating-faq] Failed to load FAQ items:", error);

    return NextResponse.json(
      {
        success: true,
        items: resolveFloatingFaqItems(null),
        source: "default",
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }
}
