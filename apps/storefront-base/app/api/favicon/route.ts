import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { getStoreInfo } from "@/lib/db/settings";
import { resolveStorefrontAssetUrl } from "@/lib/asset-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FALLBACK_FAVICON_PATH = path.join(
  process.cwd(),
  "public",
  "icons",
  "default-favicon.ico",
);

function buildResponse(body: Buffer, contentType: string) {
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}

async function readFallbackFavicon() {
  const fallbackBody = await readFile(FALLBACK_FAVICON_PATH);
  return buildResponse(fallbackBody, "image/x-icon");
}

function resolveFaviconFetchTarget(request: NextRequest, source: string) {
  if (
    source.startsWith("data:") ||
    source.startsWith("blob:") ||
    source.startsWith("/favicon.ico") ||
    source.startsWith("/api/favicon")
  ) {
    return null;
  }

  if (source.startsWith("/")) {
    return new URL(source, request.url).toString();
  }

  return source;
}

export async function GET(request: NextRequest) {
  try {
    const storeInfo = await getStoreInfo();
    const resolvedSource = resolveStorefrontAssetUrl(storeInfo?.faviconUrl);
    const target = resolvedSource ? resolveFaviconFetchTarget(request, resolvedSource) : null;

    if (target) {
      const upstreamResponse = await fetch(target, {
        redirect: "follow",
        next: {
          revalidate: 60 * 60,
        },
      });

      if (upstreamResponse.ok) {
        return buildResponse(
          Buffer.from(await upstreamResponse.arrayBuffer()),
          upstreamResponse.headers.get("content-type") || "image/x-icon",
        );
      }
    }
  } catch (error) {
    console.error("Failed to serve custom favicon:", error);
  }

  return readFallbackFavicon();
}
