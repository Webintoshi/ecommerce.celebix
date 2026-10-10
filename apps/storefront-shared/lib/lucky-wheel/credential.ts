import { createHash } from "node:crypto";

const VISITOR_COOKIE = "__Host-celebix_wheel", OPERATION_COOKIE = "__Host-celebix_wheel_operation";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
function canonical(value: string): boolean { return /^[A-Za-z0-9_-]{43}$/.test(value) && Buffer.from(value, "base64url").byteLength === 32 && Buffer.from(value, "base64url").toString("base64url") === value; }
function cookieValue(header: string | null, name: string): { kind: "missing" } | { kind: "invalid" } | { kind: "present"; value: string } {
  if (!header) return { kind: "missing" };
  if (header.length > 8192 || /[\u0000-\u001f\u007f]/.test(header)) return { kind: "invalid" };
  const values = header.split(";").map(part => part.trim()).filter(part => part.startsWith(`${name}=`)).map(part => part.slice(name.length + 1));
  return values.length === 0 ? { kind: "missing" } : values.length === 1 ? { kind: "present", value: values[0]! } : { kind: "invalid" };
}
export function readWheelCredential(header: string | null) { const selected = cookieValue(header, VISITOR_COOKIE); return selected.kind === "present" && !canonical(selected.value) ? { kind: "invalid" as const } : selected; }
export function digestWheelCredential(hostname: string, value: string): string {
  if (!canonical(value) || !hostname || hostname !== hostname.toLowerCase()) throw new Error("wheel_credential_invalid");
  return createHash("sha256").update(`celebix-wheel-visitor-v1\0${hostname}\0`).update(Buffer.from(value, "base64url")).digest("hex");
}
export function createWheelCredential(hostname: string, random: (size: number) => Uint8Array) {
  const bytes = random(32); if (!(bytes instanceof Uint8Array) || bytes.byteLength !== 32) throw new Error("wheel_credential_unavailable");
  const value = Buffer.from(bytes).toString("base64url"); return { value, digest: digestWheelCredential(hostname, value) };
}
export function serializeWheelCredential(value: string): string {
  if (!canonical(value)) throw new Error("wheel_credential_invalid");
  return `${VISITOR_COOKIE}=${value}; Path=/; Max-Age=7776000; HttpOnly; Secure; SameSite=Lax`;
}
export function readWheelOperationCookie(header: string | null): { campaignId: string; operationId: string } | null {
  const selected = cookieValue(header, OPERATION_COOKIE); if (selected.kind !== "present") return null;
  const [campaignId, operationId, extra] = selected.value.split(".");
  return campaignId && operationId && extra === undefined && UUID.test(campaignId) && UUID.test(operationId) ? { campaignId, operationId } : null;
}
export function serializeWheelOperationCookie(input: { campaignId: string; operationId: string }): string {
  if (!UUID.test(input.campaignId) || !UUID.test(input.operationId)) throw new Error("wheel_operation_invalid");
  return `${OPERATION_COOKIE}=${input.campaignId}.${input.operationId}; Path=/; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax`;
}
