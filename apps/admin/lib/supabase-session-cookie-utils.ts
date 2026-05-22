const BASE64URL_PREFIX = "base64-";
const SESSION_COOKIE_CHUNK_SIZE = 3180;

function normalizeBase64Padding(value: string): string {
  const remainder = value.length % 4;

  if (remainder === 0) {
    return value;
  }

  return `${value}${"=".repeat(4 - remainder)}`;
}

export function encodeSessionCookiePayload(payload: string): string {
  return `${BASE64URL_PREFIX}${Buffer.from(payload, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "")}`;
}

export function decodeSessionCookiePayload(encodedValue: string): string {
  const rawValue = encodedValue.startsWith(BASE64URL_PREFIX)
    ? encodedValue.slice(BASE64URL_PREFIX.length)
    : encodedValue;

  const base64 = normalizeBase64Padding(rawValue.replace(/-/g, "+").replace(/_/g, "/"));
  return Buffer.from(base64, "base64").toString("utf8");
}

export function chunkSessionCookieValue(
  cookieName: string,
  encodedValue: string,
): Array<{ name: string; value: string }> {
  if (encodedValue.length <= SESSION_COOKIE_CHUNK_SIZE) {
    return [{ name: cookieName, value: encodedValue }];
  }

  const chunks: Array<{ name: string; value: string }> = [];

  for (let offset = 0, index = 0; offset < encodedValue.length; offset += SESSION_COOKIE_CHUNK_SIZE, index += 1) {
    chunks.push({
      name: `${cookieName}.${index}`,
      value: encodedValue.slice(offset, offset + SESSION_COOKIE_CHUNK_SIZE),
    });
  }

  return chunks;
}
