import { NextRequest, NextResponse } from "next/server";
import { isAllowedStorefrontAssetHost } from "@/lib/asset-url";
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
  const responseHeaders = new Headers();

  if (asset.contentType) {
    responseHeaders.set("Content-Type", asset.contentType);
  }

  if (asset.contentLength) {
    responseHeaders.set("Content-Length", asset.contentLength);
  }

  if (asset.etag) {
    responseHeaders.set("ETag", asset.etag);
  }

  if (asset.lastModified) {
    responseHeaders.set("Last-Modified", asset.lastModified);
  }

  responseHeaders.set(
    "Cache-Control",
    "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800",
  );

  return new NextResponse(new Uint8Array(asset.body), {
    status: 200,
    headers: responseHeaders,
  });
}

export async function GET(request: NextRequest) {
  const source = request.nextUrl.searchParams.get("src");

  if (!source) {
    return buildErrorResponse("Kaynak gorsel URL'si eksik.", 400);
  }

  let targetUrl: URL;

  try {
    targetUrl = new URL(source);
  } catch {
    return buildErrorResponse("Gecersiz gorsel URL'si.", 400);
  }

  if (!["http:", "https:"].includes(targetUrl.protocol)) {
    return buildErrorResponse("Yalnizca http ve https gorselleri desteklenir.", 400);
  }

  if (!isAllowedStorefrontAssetHost(targetUrl.hostname)) {
    return buildErrorResponse("Bu gorsel kaynagina izin verilmiyor.", 403);
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
    console.error("Asset proxy fetch failed:", error);
    return buildErrorResponse("Gorsel kaynagina ulasilamadi.", 502);
  }

  if (!upstreamResponse.ok || !upstreamResponse.body) {
    return buildErrorResponse("Gorsel yuklenemedi.", upstreamResponse.status || 502);
  }

  return buildAssetResponse({
    body: Buffer.from(await upstreamResponse.arrayBuffer()),
    contentType: upstreamResponse.headers.get("content-type"),
    contentLength: upstreamResponse.headers.get("content-length"),
    etag: upstreamResponse.headers.get("etag"),
    lastModified: upstreamResponse.headers.get("last-modified"),
  });
}
