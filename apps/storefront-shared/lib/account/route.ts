import { timingSafeEqual } from "node:crypto";

import { StorefrontIdentityRepositoryError } from "@celebix/saas-data";

import type { TrustedStorefrontHostAuthority } from "../trusted-host-authority.ts";
import { normalizeStorefrontAccountEmail } from "./email.ts";
import { readAccountJsonRequest, safeAccountReturnTo } from "./request.ts";
import type { StorefrontIdentityRuntime } from "./runtime.ts";

type Brand = Readonly<{ storeName: string; logoUrl: string | null; primaryColor: string | null }>;
type Dependencies = Readonly<{
  selectAuthority(headers: Headers): TrustedStorefrontHostAuthority;
  resolveRuntime(): Promise<StorefrontIdentityRuntime | null>;
  resolveBrand(hostname: string): Promise<Brand | null>;
  requestAuthority(headers: Headers): string;
}>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const CODE = /^[0-9]{6}$/u;
const PHONE = /^\+[1-9][0-9]{7,14}$/u;
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/u;

function json(body: unknown, status: number, cookies: readonly string[] = []): Response {
  const headers = new Headers({ "cache-control": "no-store, max-age=0", "content-type": "application/json; charset=utf-8", "x-content-type-options": "nosniff" });
  for (const cookie of cookies) headers.append("set-cookie", cookie);
  return new Response(JSON.stringify(body), { status, headers });
}
function invalid(): never { throw new TypeError("storefront_account_request_invalid"); }
function exact(value: unknown, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value); const allowed = new Set([...required, ...optional]);
  if (Object.keys(descriptors).some((key) => !allowed.has(key)) || required.some((key) => !Object.hasOwn(descriptors, key))) invalid();
  for (const descriptor of Object.values(descriptors)) if (!("value" in descriptor) || descriptor.get || descriptor.set || !descriptor.enumerable) invalid();
  return value as Record<string, unknown>;
}
function text(value: unknown, minimum: number, maximum: number): string { if (typeof value !== "string" || value !== value.trim() || value.length < minimum || value.length > maximum || CONTROL.test(value)) invalid(); return value; }
function authority(dependencies: Dependencies, request: Request): Readonly<{ hostname: string; origin: string }> | null {
  try { const selected = dependencies.selectAuthority(request.headers); return selected.kind === "trusted" ? Object.freeze({ hostname: selected.hostname, origin: `https://${selected.hostname}` }) : null; } catch { return null; }
}
async function selectedRuntime(dependencies: Dependencies): Promise<StorefrontIdentityRuntime | null> { try { return await dependencies.resolveRuntime(); } catch { return null; } }
function failure(error: unknown): Response {
  const code = error instanceof StorefrontIdentityRepositoryError ? error.code : error instanceof TypeError ? "invalid_input" : "unavailable";
  if (code === "challenge_invalid") return json({ code, message: "Kod geçersiz veya süresi dolmuş." }, 401);
  if (code === "unauthenticated") return json({ code, message: "Oturumunuz sona erdi." }, 401);
  if (code === "account_suspended") return json({ code, message: "Bu hesap şu anda kullanılamıyor." }, 403);
  if (code === "invalid_input") return json({ code, message: "Bilgileri kontrol edin." }, 400);
  if (code === "not_found") return json({ code, message: "Kayıt bulunamadı." }, 404);
  if (["version_conflict", "operation_mismatch"].includes(code)) return json({ code, message: "Bilgiler değişti. Sayfayı yenileyip tekrar deneyin." }, 409);
  return json({ code: "unavailable", message: "İşlem şu anda tamamlanamadı. Lütfen tekrar deneyin." }, 503);
}
function csrf(request: Request): boolean {
  const provided = request.headers.get("x-celebix-account-csrf"); const cookieHeader = request.headers.get("cookie");
  if (!provided || !cookieHeader || provided.length > 256 || CONTROL.test(provided)) return false;
  const values: string[] = [];
  for (const part of cookieHeader.split(";")) { const item = part.trim(); if (item.startsWith("__Host-celebix_account_csrf=")) values.push(item.slice("__Host-celebix_account_csrf=".length)); }
  if (values.length !== 1 || !values[0] || values[0].length !== provided.length) return false;
  return timingSafeEqual(Buffer.from(values[0]), Buffer.from(provided));
}
function requireCsrf(request: Request): Response | null { return csrf(request) ? null : json({ code: "csrf_invalid", message: "Güvenlik doğrulaması başarısız." }, 403); }

export function createAccountAuthStartRoute(dependencies: Dependencies) {
  return async function POST(request: Request): Promise<Response> {
    const selected = authority(dependencies, request); if (!selected) return json({ code: "unavailable", message: "İşlem şu anda tamamlanamadı. Lütfen tekrar deneyin." }, 503);
    let input: { email: string; returnTo: string };
    try { input = await readAccountJsonRequest(request, selected.origin, (value) => { const p = exact(value, ["email"], ["returnTo"]); return { email: normalizeStorefrontAccountEmail(p.email), returnTo: Object.hasOwn(p, "returnTo") ? safeAccountReturnTo(p.returnTo) : "/account" }; }); } catch { return failure(new TypeError()); }
    const [runtime, brand] = await Promise.all([selectedRuntime(dependencies), dependencies.resolveBrand(selected.hostname).catch(() => null)]); if (!runtime || !brand) return failure(new Error());
    try {
      const result = await runtime.start({ hostname: selected.hostname, email: input.email, requestAuthority: dependencies.requestAuthority(request.headers), brand });
      return json({ ...result.result, destination: "/account/verify", returnTo: input.returnTo }, 200, [result.setCookie]);
    } catch (error) { return failure(error); }
  };
}

export function createAccountAuthVerifyRoute(dependencies: Dependencies) {
  return async function POST(request: Request): Promise<Response> {
    const selected = authority(dependencies, request); if (!selected) return failure(new Error());
    let input: { code: string; returnTo: string };
    try { input = await readAccountJsonRequest(request, selected.origin, (value) => { const p = exact(value, ["code"], ["returnTo"]); const code = text(p.code, 6, 6); if (!CODE.test(code)) invalid(); return { code, returnTo: Object.hasOwn(p, "returnTo") ? safeAccountReturnTo(p.returnTo) : "/account" }; }); } catch { return failure(new TypeError()); }
    const runtime = await selectedRuntime(dependencies); if (!runtime) return failure(new Error());
    try {
      const result = await runtime.verify({ hostname: selected.hostname, challengeCookie: request.headers.get("cookie"), code: input.code, deviceLabel: "Web tarayıcısı", userAgent: request.headers.get("user-agent") || "Bilinmeyen tarayıcı" });
      return json({ ...result.result, destination: result.result.profileRequired ? "/account/profile" : input.returnTo }, 200, result.setCookies);
    } catch (error) { return failure(error); }
  };
}

export function createAccountProfileCompleteRoute(dependencies: Dependencies) {
  return async function POST(request: Request): Promise<Response> {
    const selected = authority(dependencies, request); if (!selected) return failure(new Error()); const csrfFailure = requireCsrf(request); if (csrfFailure) return csrfFailure;
    let input: { operationId: string; firstName: string; lastName: string; phone?: string };
    try { input = await readAccountJsonRequest(request, selected.origin, (value) => { const p = exact(value, ["operationId", "firstName", "lastName"], ["phone"]); const operationId = text(p.operationId, 36, 36); if (!UUID.test(operationId)) invalid(); const phone = Object.hasOwn(p, "phone") ? text(p.phone, 9, 16) : undefined; if (phone && !PHONE.test(phone)) invalid(); return { operationId, firstName: text(p.firstName, 1, 100), lastName: text(p.lastName, 1, 100), ...(phone ? { phone } : {}) }; }); } catch { return failure(new TypeError()); }
    const runtime = await selectedRuntime(dependencies); if (!runtime) return failure(new Error());
    try { const result = await runtime.completeProfile({ hostname: selected.hostname, cookieHeader: request.headers.get("cookie"), ...input, deviceLabel: "Web tarayıcısı", userAgent: request.headers.get("user-agent") || "Bilinmeyen tarayıcı" }); return json({ ...result.result, destination: "/account" }, 200, result.setCookies); } catch (error) { return failure(error); }
  };
}

export function createAccountLogoutRoute(dependencies: Dependencies) {
  return async function POST(request: Request): Promise<Response> {
    const selected = authority(dependencies, request); if (!selected) return failure(new Error()); const csrfFailure = requireCsrf(request); if (csrfFailure) return csrfFailure;
    try { await readAccountJsonRequest(request, selected.origin, (value) => { exact(value, []); return true; }); } catch { return failure(new TypeError()); }
    const runtime = await selectedRuntime(dependencies); if (!runtime) return failure(new Error());
    try { const result = await runtime.logout(selected.hostname, request.headers.get("cookie")); return json({ outcome: "logged_out", destination: "/account/login" }, 200, result.setCookies); } catch (error) { return failure(error); }
  };
}

export function createAccountLogoutAllRoute(dependencies: Dependencies) {
  return async function POST(request: Request): Promise<Response> {
    const selected = authority(dependencies, request); if (!selected) return failure(new Error()); const csrfFailure = requireCsrf(request); if (csrfFailure) return csrfFailure;
    try { await readAccountJsonRequest(request, selected.origin, (value) => { exact(value, []); return true; }); } catch { return failure(new TypeError()); }
    const runtime = await selectedRuntime(dependencies); if (!runtime) return failure(new Error());
    try { const result = await runtime.logoutAll({ hostname: selected.hostname, cookieHeader: request.headers.get("cookie") }); return json({ outcome: "logged_out", revoked: result.revoked, destination: "/account/login" }, 200, result.setCookies); } catch (error) { return failure(error); }
  };
}

export function createAccountProfileUpdateRoute(dependencies: Dependencies) {
  return async function POST(request: Request): Promise<Response> {
    const selected = authority(dependencies, request); if (!selected) return failure(new Error()); const csrfFailure = requireCsrf(request); if (csrfFailure) return csrfFailure;
    let input: { operationId: string; firstName: string; lastName: string; phone?: string; expectedVersion: number };
    try { input = await readAccountJsonRequest(request, selected.origin, (value) => { const p = exact(value, ["operationId", "firstName", "lastName", "expectedVersion"], ["phone"]); const operationId = text(p.operationId, 36, 36); if (!UUID.test(operationId) || !Number.isSafeInteger(p.expectedVersion) || (p.expectedVersion as number) < 1) invalid(); const phone = Object.hasOwn(p, "phone") ? text(p.phone, 9, 16) : undefined; if (phone && !PHONE.test(phone)) invalid(); return { operationId, firstName: text(p.firstName, 1, 100), lastName: text(p.lastName, 1, 100), ...(phone ? { phone } : {}), expectedVersion: p.expectedVersion as number }; }); } catch { return failure(new TypeError()); }
    const runtime = await selectedRuntime(dependencies); if (!runtime) return failure(new Error());
    try { const result = await runtime.updateProfile({ hostname: selected.hostname, cookieHeader: request.headers.get("cookie"), ...input }); return json(result.result, 200); } catch (error) { return failure(error); }
  };
}

export function createAccountAddressSaveRoute(dependencies: Dependencies) {
  return async function POST(request: Request): Promise<Response> {
    const selected = authority(dependencies, request); if (!selected) return failure(new Error()); const csrfFailure = requireCsrf(request); if (csrfFailure) return csrfFailure;
    let input: { operationId: string; expectedVersion: number; address: Parameters<StorefrontIdentityRuntime["saveAddress"]>[0]["address"] };
    try { input = await readAccountJsonRequest(request, selected.origin, (value) => { const p = exact(value, ["operationId", "expectedVersion", "address"]); const operationId = text(p.operationId, 36, 36); if (!UUID.test(operationId) || !Number.isSafeInteger(p.expectedVersion) || (p.expectedVersion as number) < 0) invalid(); const a = exact(p.address, ["id", "label", "recipientName", "line1", "city", "country", "isDefault", "version"], ["line2", "district", "postalCode"]); const id = text(a.id, 36, 36); if (!UUID.test(id) || a.country !== "TR" || typeof a.isDefault !== "boolean" || !Number.isSafeInteger(a.version) || (a.version as number) < 1) invalid(); return { operationId, expectedVersion: p.expectedVersion as number, address: { id, label: text(a.label, 1, 50), recipientName: text(a.recipientName, 1, 200), line1: text(a.line1, 1, 300), ...(Object.hasOwn(a, "line2") ? { line2: text(a.line2, 1, 300) } : {}), city: text(a.city, 1, 100), ...(Object.hasOwn(a, "district") ? { district: text(a.district, 1, 100) } : {}), ...(Object.hasOwn(a, "postalCode") ? { postalCode: text(a.postalCode, 1, 20) } : {}), country: "TR", isDefault: a.isDefault, version: a.version as number } }; }); } catch { return failure(new TypeError()); }
    const runtime = await selectedRuntime(dependencies); if (!runtime) return failure(new Error());
    try { return json((await runtime.saveAddress({ hostname: selected.hostname, cookieHeader: request.headers.get("cookie"), ...input })).result, 200); } catch (error) { return failure(error); }
  };
}

export function createAccountAddressDeleteRoute(dependencies: Dependencies) {
  return async function POST(request: Request): Promise<Response> {
    const selected = authority(dependencies, request); if (!selected) return failure(new Error()); const csrfFailure = requireCsrf(request); if (csrfFailure) return csrfFailure;
    let input: { operationId: string; addressId: string; expectedVersion: number };
    try { input = await readAccountJsonRequest(request, selected.origin, (value) => { const p = exact(value, ["operationId", "addressId", "expectedVersion"]); const operationId = text(p.operationId, 36, 36); const addressId = text(p.addressId, 36, 36); if (!UUID.test(operationId) || !UUID.test(addressId) || !Number.isSafeInteger(p.expectedVersion) || (p.expectedVersion as number) < 1) invalid(); return { operationId, addressId, expectedVersion: p.expectedVersion as number }; }); } catch { return failure(new TypeError()); }
    const runtime = await selectedRuntime(dependencies); if (!runtime) return failure(new Error());
    try { return json((await runtime.deleteAddress({ hostname: selected.hostname, cookieHeader: request.headers.get("cookie"), ...input })).result, 200); } catch (error) { return failure(error); }
  };
}

export function createAccountFavoriteRoute(dependencies: Dependencies) {
  return async function POST(request: Request): Promise<Response> {
    const selected = authority(dependencies, request); if (!selected) return failure(new Error()); const csrfFailure = requireCsrf(request); if (csrfFailure) return csrfFailure;
    let input: { operationId: string; productId: string; enabled: boolean };
    try { input = await readAccountJsonRequest(request, selected.origin, (value) => { const p = exact(value, ["operationId", "productId", "enabled"]); const operationId = text(p.operationId, 36, 36); const productId = text(p.productId, 36, 36); if (!UUID.test(operationId) || !UUID.test(productId) || typeof p.enabled !== "boolean") invalid(); return { operationId, productId, enabled: p.enabled }; }); } catch { return failure(new TypeError()); }
    const runtime = await selectedRuntime(dependencies); if (!runtime) return failure(new Error());
    try { return json((await runtime.favorite({ hostname: selected.hostname, cookieHeader: request.headers.get("cookie"), ...input })).result, 200); } catch (error) { return failure(error); }
  };
}

export function createAccountDeviceRevokeRoute(dependencies: Dependencies) {
  return async function POST(request: Request): Promise<Response> {
    const selected = authority(dependencies, request); if (!selected) return failure(new Error()); const csrfFailure = requireCsrf(request); if (csrfFailure) return csrfFailure;
    let input: { operationId: string; deviceId: string };
    try { input = await readAccountJsonRequest(request, selected.origin, (value) => { const p = exact(value, ["operationId", "deviceId"]); const operationId = text(p.operationId, 36, 36); const deviceId = text(p.deviceId, 39, 39); if (!UUID.test(operationId) || !/^device_[a-f0-9]{32}$/u.test(deviceId)) invalid(); return { operationId, deviceId }; }); } catch { return failure(new TypeError()); }
    const runtime = await selectedRuntime(dependencies); if (!runtime) return failure(new Error());
    try { return json((await runtime.revokeDevice({ hostname: selected.hostname, cookieHeader: request.headers.get("cookie"), ...input })).result, 200); } catch (error) { return failure(error); }
  };
}

export function createAccountSessionRoute(dependencies: Dependencies) {
  return async function GET(request: Request): Promise<Response> {
    const selected = authority(dependencies, request); if (!selected) return failure(new Error());
    let url: URL; try { url = new URL(request.url); } catch { return failure(new TypeError()); }
    if (request.method !== "GET" || url.pathname !== "/api/account/session" || url.search || url.hash) return failure(new TypeError());
    const runtime = await selectedRuntime(dependencies); if (!runtime) return failure(new Error());
    try { const result = await runtime.session(selected.hostname, request.headers.get("cookie")); return json(result.outcome === "found" ? { outcome: "found", snapshot: result.snapshot } : { outcome: result.outcome }, 200, result.setCookie ? [result.setCookie] : []); } catch (error) { return failure(error); }
  };
}
