import { parsePublicMediaKey } from "./key-authority.ts";

type R2ObjectBodyLike = Readonly<{
  body: BodyInit;
  size: number;
  etag: string;
  httpEtag: string;
  httpMetadata?: Readonly<{ contentType?: string }>;
  customMetadata?: Readonly<Record<string, string>>;
}>;
type Environment = Readonly<{
  MEDIA_BUCKET: Readonly<{ get(key: string): Promise<R2ObjectBodyLike | null> }>;
}>;
export type MediaGateway = Readonly<{ fetch(request: Request, environment: Environment): Promise<Response> }>;

const PRIVATE_HEADERS = Object.freeze([
  "authorization", "cookie", "range", "forwarded", "x-forwarded-for", "x-forwarded-host",
  "x-forwarded-proto", "x-real-ip", "x-store-id", "x-tenant-id", "x-principal-id",
]);
const MEDIA_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
function safe(status: number): Response { return new Response(null, { status, headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } }); }

export function createMediaGateway(): MediaGateway {
  return Object.freeze({
    async fetch(request: Request, environment: Environment): Promise<Response> {
      if (!request || !environment?.MEDIA_BUCKET || typeof environment.MEDIA_BUCKET.get !== "function") return safe(503);
      if (request.method !== "GET" && request.method !== "HEAD") return safe(405);
      if (PRIVATE_HEADERS.some((name) => request.headers.has(name)) || request.headers.has("content-length") || request.headers.has("transfer-encoding") || request.body !== null) return safe(400);
      if (request.url.includes("%") || request.url.includes("\\")) return safe(400);
      let url: URL;
      try { url = new URL(request.url); } catch { return safe(400); }
      if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) return safe(400);
      const selected = parsePublicMediaKey(url.pathname);
      if (!selected) return safe(403);
      let object: R2ObjectBodyLike | null;
      try { object = await environment.MEDIA_BUCKET.get(selected.key); } catch { return safe(503); }
      if (!object) return safe(404);
      const mediaType = object.httpMetadata?.contentType;
      const payloadSha256 = object.customMetadata?.["celebix-sha256"];
      const publication = object.customMetadata?.["celebix-publication"];
      if (publication !== "active") return safe(404);
      if (!Number.isSafeInteger(object.size) || object.size < 1 || object.size > 5_242_880 || !MEDIA_TYPES.has(mediaType ?? "") || !payloadSha256 || !/^[a-f0-9]{64}$/.test(payloadSha256) || typeof object.etag !== "string" || !object.etag || typeof object.httpEtag !== "string" || !/^"[^"\u0000-\u001f\u007f]*"$/.test(object.httpEtag)) return safe(503);
      const headers = new Headers({
        "cache-control": "public, max-age=31536000, immutable",
        "content-length": String(object.size),
        "content-type": mediaType as string,
        etag: object.httpEtag,
        "x-content-type-options": "nosniff",
      });
      return new Response(request.method === "HEAD" ? null : object.body, { status: 200, headers });
    },
  });
}

export default createMediaGateway();
