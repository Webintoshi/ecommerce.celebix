import { NextRequest, NextResponse } from "next/server";
import { isAllowedAdminAssetHost } from "@/lib/asset-url";
import { fetchCurrentStoreR2Asset } from "@/lib/r2-asset-fetch";

export const runtime = "nodejs";

function buildErrorResponse(message: string, status: number) {
  return NextResponse.json({ success: false, error: message }, { status });
}

function buildAssetResponse(asset: {
  body: Buffer;
  contentType: string | null;
  contentLength: string | null;
  etag: string | null;
  lastModified: string | null;
}) {
  const headers = new Headers();

  if (asset.contentType) headers.set("Content-Type", asset.contentType);
  if (asset.contentLength) headers.set("Content-Length", asset.contentLength);
  if (asset.etag) headers.set("ETag", asset.etag);
  if (asset.lastModified) headers.set("Last-Modified", asset.lastModified);
  headers.set("Cache-Control", "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400");

  return new NextResponse(asset.body, { status: 200, headers });
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

  if (!isAllowedAdminAssetHost(targetUrl.hostname)) {
    return buildErrorResponse("Bu görsel kaynağına izin verilmiyor.", 403);
  }

  const r2Asset = await fetchCurrentStoreR2Asset(targetUrl.toString());
  if (r2Asset) {
    return buildAssetResponse(r2Asset);
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
    console.error("Admin asset proxy fetch failed:", error);
    return buildErrorResponse("Görsel kaynağına ulaşılamadı.", 502);
  }

  if (!upstreamResponse.ok || !upstreamResponse.body) {
    return buildErrorResponse("Görsel yüklenemedi.", upstreamResponse.status || 502);
  }

  return buildAssetResponse({
    body: Buffer.from(await upstreamResponse.arrayBuffer()),
    contentType: upstreamResponse.headers.get("content-type"),
    contentLength: upstreamResponse.headers.get("content-length"),
    etag: upstreamResponse.headers.get("etag"),
    lastModified: upstreamResponse.headers.get("last-modified"),
  });
}
