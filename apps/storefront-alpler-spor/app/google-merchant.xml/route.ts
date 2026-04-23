import { buildGoogleMerchantFeedForStorefront } from "@/lib/google-merchant-feed";

export async function GET() {
  const xml = await buildGoogleMerchantFeedForStorefront();

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=900, stale-while-revalidate=3600",
    },
  });
}
