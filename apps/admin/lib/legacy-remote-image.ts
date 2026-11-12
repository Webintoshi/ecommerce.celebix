import "server-only";

import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { isLegacyPublicAddress, LEGACY_MEDIA_MAX_BYTES, legacyImageType } from "./legacy-media-policy";

export async function fetchLegacyRemoteImage(url: URL) {
  const addresses = await lookup(url.hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => !isLegacyPublicAddress(address))) {
    throw new Error("image_destination_denied");
  }
  const target = addresses[0];
  return new Promise<{ body: Buffer; contentType: string; etag: string | null; lastModified: string | null }>((resolve, reject) => {
    const outbound = request(url, {
      headers: { accept: "image/*", "accept-encoding": "identity" },
      lookup: (_hostname, options, callback) => {
        if (options.all) callback(null, addresses);
        else callback(null, target.address, target.family);
      },
      signal: AbortSignal.timeout(8000),
    }, (response) => {
      const contentType = legacyImageType(response.headers["content-type"]);
      const declaredLength = response.headers["content-length"];
      if (response.statusCode !== 200 || !contentType || (declaredLength && Number(declaredLength) > LEGACY_MEDIA_MAX_BYTES)) {
        response.destroy();
        reject(new Error("image_source_denied"));
        return;
      }
      const parts: Buffer[] = [];
      let length = 0;
      response.on("data", (part: Buffer) => {
        length += part.length;
        if (length > LEGACY_MEDIA_MAX_BYTES) {
          response.destroy(new Error("image_too_large"));
          return;
        }
        parts.push(part);
      });
      response.on("error", reject);
      response.on("end", () => resolve({
        body: Buffer.concat(parts, length),
        contentType,
        etag: response.headers.etag ?? null,
        lastModified: response.headers["last-modified"] ?? null,
      }));
    });
    outbound.on("error", reject);
    outbound.end();
  });
}
