import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiAuth } from "@/lib/admin-api-auth";
import { parseXmlProductFeed } from "@/lib/admin/product-feed-import";

export const runtime = "nodejs";

const MAX_FEED_BYTES = 8 * 1024 * 1024;
const FEED_TIMEOUT_MS = 20000;

export async function POST(request: NextRequest) {
  const authResult = await requireAdminApiAuth();
  if (authResult.response) {
    return authResult.response;
  }

  try {
    const body = (await request.json().catch(() => null)) as
      | {
          url?: string;
        }
      | null;

    const feedUrl = body?.url?.trim();
    if (!feedUrl) {
      return NextResponse.json(
        { success: false, error: "Feed URL zorunludur." },
        { status: 400 },
      );
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(feedUrl);
    } catch {
      return NextResponse.json(
        { success: false, error: "Geçerli bir feed URL girin." },
        { status: 400 },
      );
    }

    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      return NextResponse.json(
        { success: false, error: "Feed URL yalnızca http veya https olabilir." },
        { status: 400 },
      );
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FEED_TIMEOUT_MS);

    try {
      const response = await fetch(parsedUrl.toString(), {
        cache: "no-store",
        redirect: "follow",
        headers: {
          Accept: "application/xml,text/xml,application/atom+xml;q=0.9,*/*;q=0.8",
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        return NextResponse.json(
          {
            success: false,
            error: `Feed alınamadı: ${response.status} ${response.statusText || ""}`.trim(),
          },
          { status: 502 },
        );
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.byteLength > MAX_FEED_BYTES) {
        return NextResponse.json(
          {
            success: false,
            error: "Feed çok büyük. Lütfen daha küçük bir feed veya filtrelenmiş URL kullanın.",
          },
          { status: 413 },
        );
      }

      const xmlContent = buffer.toString("utf8");
      const parseResult = parseXmlProductFeed(xmlContent);

      return NextResponse.json({
        success: true,
        parseResult,
        meta: {
          source: parsedUrl.toString(),
          host: parsedUrl.host,
        },
      });
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    console.error("Admin feed preview route error:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.name === "AbortError"
              ? "Feed zaman aşımına uğradı. Lütfen tekrar deneyin."
              : error.message
            : "Feed işlenemedi.",
      },
      { status: 500 },
    );
  }
}
