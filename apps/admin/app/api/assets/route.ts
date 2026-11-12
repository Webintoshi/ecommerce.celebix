import { NextRequest, NextResponse } from "next/server";
import { LEGACY_ASSET_DOCUMENT_POLICY, legacyImageType, parseLegacyAssetSource } from "@/lib/legacy-media-policy";
import { fetchLegacyRemoteImage } from "@/lib/legacy-remote-image";
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

  const contentType = legacyImageType(asset.contentType);
  if (!contentType) return buildErrorResponse("Görsel biçimi desteklenmiyor.", 415);
  headers.set("Content-Type", contentType);
  headers.set("Content-Security-Policy", LEGACY_ASSET_DOCUMENT_POLICY);
  headers.set("X-Content-Type-Options", "nosniff");
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

  const targetUrl = parseLegacyAssetSource(source);
  if (!targetUrl) {
    return buildErrorResponse("Bu görsel kaynağına izin verilmiyor.", 403);
  }

  const r2Asset = await fetchCurrentStoreR2Asset(targetUrl.toString());
  if (r2Asset) {
    return buildAssetResponse(r2Asset);
  }

  try {
    const upstream = await fetchLegacyRemoteImage(targetUrl);
    return buildAssetResponse({ ...upstream, contentLength: String(upstream.body.length) });
  } catch (error) {
    console.error("Admin asset proxy fetch failed:", error);
    return buildErrorResponse("Görsel kaynağına ulaşılamadı.", 502);
  }
}
