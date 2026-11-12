import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyAccountingWebhook(
  input: Readonly<{ body: Uint8Array; signature: string | null; timestamp: string | null }>,
  secret: string | undefined,
  now = Date.now(),
): boolean {
  if (!secret || Buffer.byteLength(secret) < 32 || !input.signature || !/^[a-f0-9]{64}$/.test(input.signature)) return false;
  if (!input.timestamp || !/^\d{10}$/.test(input.timestamp) || Math.abs(now - Number(input.timestamp) * 1000) > 300_000) return false;
  const expected = createHmac("sha256", secret).update(input.timestamp).update(".").update(input.body).digest();
  return timingSafeEqual(expected, Buffer.from(input.signature, "hex"));
}
