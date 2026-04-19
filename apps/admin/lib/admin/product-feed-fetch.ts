import "server-only";

import { parseXmlProductFeed } from "@/lib/admin/product-feed-import";

const MAX_FEED_BYTES = 8 * 1024 * 1024;
const FEED_TIMEOUT_MS = 20000;

export async function fetchAndParseXmlProductFeed(feedUrl: string) {
  const normalizedFeedUrl = feedUrl.trim();

  if (!normalizedFeedUrl) {
    throw new Error("Feed URL zorunludur.");
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(normalizedFeedUrl);
  } catch {
    throw new Error("Geçerli bir feed URL girin.");
  }

  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    throw new Error("Feed URL yalnızca http veya https olabilir.");
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
      throw new Error(`Feed alınamadı: ${response.status} ${response.statusText || ""}`.trim());
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength > MAX_FEED_BYTES) {
      throw new Error("Feed çok büyük. Lütfen daha küçük bir feed veya filtrelenmiş URL kullanın.");
    }

    return {
      parseResult: parseXmlProductFeed(buffer.toString("utf8")),
      source: parsedUrl.toString(),
      host: parsedUrl.host,
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Feed zaman aşımına uğradı. Lütfen tekrar deneyin.");
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
