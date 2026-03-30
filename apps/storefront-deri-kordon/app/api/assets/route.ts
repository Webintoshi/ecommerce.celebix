import { NextRequest, NextResponse } from "next/server";
import { isAllowedStorefrontAssetHost } from "@/lib/asset-url";

export const runtime = "nodejs";

function buildErrorResponse(message: string, status: number) {
  return NextResponse.json({ success: false, error: message }, { status });
}

export async function GET(request: NextRequest) {
  const source = request.nextUrl.searchParams.get("src");

  if (!source) {
    return buildErrorResponse("Kaynak görsel URL'si eksik.", 400);
  }

  let targetUrl: URL;

  try {
    targetUrl = new URL(source);
  } catch {
    return buildErrorResponse("Geçersiz görsel URL'si.", 400);
  }

  if (!["http:", "https:"].includes(targetUrl.protocol)) {
    return buildErrorResponse("Yalnızca http ve https görselleri desteklenir.", 400);
  }

  if (!isAllowedStorefrontAssetHost(targetUrl.hostname)) {
    return buildErrorResponse("Bu görsel kaynağına izin verilmiyor.", 403);
  }

  let upstreamResponse: Response;

  try {
    upstreamResponse = await fetch(targetUrl.toString(), {
      headers: {
        accept: "image/*,*/*;q=0.8",
      },
      redirect: "follow",
      next: {
        revalidate: 60 * 60,
      },
    });
  } catch (error) {
    console.error("Asset proxy fetch failed:", error);
    return buildErrorResponse("Görsel kaynağına ulaşılamadı.", 502);
  }

  if (!upstreamResponse.ok || !upstreamResponse.body) {
    return buildErrorResponse("Görsel yüklenemedi.", upstreamResponse.status || 502);
  }

  const responseHeaders = new Headers();
  const contentType = upstreamResponse.headers.get("content-type");
  const contentLength = upstreamResponse.headers.get("content-length");
  const etag = upstreamResponse.headers.get("etag");
  const lastModified = upstreamResponse.headers.get("last-modified");

  if (contentType) {
    responseHeaders.set("Content-Type", contentType);
  }

  if (contentLength) {
    responseHeaders.set("Content-Length", contentLength);
  }

  if (etag) {
    responseHeaders.set("ETag", etag);
  }

  if (lastModified) {
    responseHeaders.set("Last-Modified", lastModified);
  }

  responseHeaders.set("Cache-Control", "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400");

  return new NextResponse(upstreamResponse.body, {
    status: 200,
    headers: responseHeaders,
  });
}
