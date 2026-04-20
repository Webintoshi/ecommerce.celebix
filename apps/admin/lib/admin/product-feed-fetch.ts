import "server-only";

import { parseXmlProductFeed } from "@/lib/admin/product-feed-import";

const MAX_FEED_BYTES = 32 * 1024 * 1024;
const MAX_FEED_SIZE_MB = Math.round(MAX_FEED_BYTES / (1024 * 1024));
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
    throw new Error("Gecerli bir feed URL girin.");
  }

  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    throw new Error("Feed URL yalnizca http veya https olabilir.");
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
      throw new Error(`Feed alinamadi: ${response.status} ${response.statusText || ""}`.trim());
    }

    const contentLengthHeader = response.headers.get("content-length");
    const declaredLength = contentLengthHeader ? Number.parseInt(contentLengthHeader, 10) : Number.NaN;
    if (Number.isFinite(declaredLength) && declaredLength > MAX_FEED_BYTES) {
      throw new Error(`Feed cok buyuk. Su an en fazla ${MAX_FEED_SIZE_MB} MB destekleniyor.`);
    }

    const buffer = await readResponseBufferWithLimit(response, controller);

    return {
      parseResult: parseXmlProductFeed(buffer.toString("utf8")),
      source: parsedUrl.toString(),
      host: parsedUrl.host,
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Feed zaman asimina ugradi. Lutfen tekrar deneyin.");
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function readResponseBufferWithLimit(
  response: Response,
  controller: AbortController,
): Promise<Buffer> {
  if (!response.body) {
    return Buffer.alloc(0);
  }

  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    const chunk = Buffer.from(value);
    totalBytes += chunk.byteLength;
    if (totalBytes > MAX_FEED_BYTES) {
      controller.abort();
      throw new Error(`Feed cok buyuk. Su an en fazla ${MAX_FEED_SIZE_MB} MB destekleniyor.`);
    }

    chunks.push(chunk);
  }

  return Buffer.concat(chunks);
}
