import { parsePanelBrowserBindingCookie } from "../panel-browser-binding/cookie.ts";
import {
  createCustomerPanelCallbackRequestAuthorityValidator,
  validatePublicCustomerPanelCallbackAuthority,
} from "../panel-auth-authority/callback-request-authority.ts";

const SUCCESS_PARAMETERS = new Set(["state", "code", "iss"]);
const ERROR_PARAMETERS = new Set(["state", "error", "error_description", "error_uri", "iss"]);
const PRIVATE_HEADERS = [
  "authorization",
  "cookie",
  "x-celebix-callback-key-id",
  "x-celebix-callback-timestamp",
  "x-celebix-callback-signature",
  "x-celebix-edge-trust",
  "x-celebix-tenant-id",
  "x-celebix-principal-id",
  "x-celebix-store-id",
  "x-celebix-session-id",
  "x-celebix-return-url",
  "x-celebix-session-response-key-id",
  "x-celebix-session-response-timestamp",
  "x-celebix-session-response-signature",
] as const;

export type CustomerPanelCallbackRequest = Readonly<
  | { kind: "success"; callbackUrl: string; state: string; code: string; responseIssuer?: string }
  | { kind: "provider_error"; callbackUrl: string; state: string; error: string; responseIssuer?: string }
>;

export type BrowserBoundPanelCompletionRequest = Readonly<
  | { kind: "success"; callbackUrl: string; state: string; code: string; responseIssuer?: string; browserBindingCredential: string }
  | { kind: "provider_error"; callbackUrl: string; state: string; error: string; responseIssuer?: string; browserBindingCredential: string }
>;

export class CallbackRequestValidationError extends Error {
  readonly status: number;

  constructor(status = 400) {
    super("customer_panel_callback_request_invalid");
    this.name = "CallbackRequestValidationError";
    this.status = status;
  }
}

function reject(status = 400): never {
  throw new CallbackRequestValidationError(status);
}

export function validateCustomerPanelCallbackAuthority(value: string): string {
  try { return validatePublicCustomerPanelCallbackAuthority(value); }
  catch { return reject(); }
}

function boundedInteger(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > 16_384) reject();
  return value;
}

function rawSearch(rawQuery: string): URLSearchParams {
  if (!rawQuery) reject();
  for (const pair of rawQuery.split("&")) {
    if (!pair) reject();
    const equals = pair.indexOf("=");
    const pieces = equals < 0 ? [pair] : [pair.slice(0, equals), pair.slice(equals + 1)];
    for (const piece of pieces) {
      try { decodeURIComponent(piece.replaceAll("+", " ")); }
      catch { reject(); }
    }
  }
  return new URLSearchParams(rawQuery);
}

function exactSingle(search: URLSearchParams, name: string, maximum: number): string {
  const values = search.getAll(name);
  const value = values[0];
  if (
    values.length !== 1 || !value || value !== value.trim() || value.length > maximum ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) reject();
  return value;
}

function exactResponseIssuer(search: URLSearchParams): string | undefined {
  if (!search.has("iss")) return undefined;
  const value = exactSingle(search, "iss", 2_048);
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" || url.username || url.password || url.search || url.hash ||
      url.toString().replace(/\/$/, "") !== value
    ) reject();
    return value;
  } catch (error) {
    if (error instanceof CallbackRequestValidationError) throw error;
    return reject();
  }
}

function classify(callbackUrl: string, authority: string, maximumQueryBytes: number): CustomerPanelCallbackRequest {
  let url: URL;
  try { url = new URL(callbackUrl); }
  catch { return reject(); }
  if (
    url.protocol !== "https:" || url.username || url.password || url.port || url.hash ||
    `${url.origin}${url.pathname}` !== authority
  ) reject();
  const marker = callbackUrl.indexOf("?");
  const rawQuery = marker < 0 ? "" : callbackUrl.slice(marker + 1);
  if (new TextEncoder().encode(rawQuery).byteLength > maximumQueryBytes) reject(413);
  const search = rawSearch(rawQuery);
  const names = [...search.keys()];
  if (names.some((name, index) => names.indexOf(name) !== index)) reject();
  const hasCode = search.has("code");
  const hasError = search.has("error");
  if (hasCode === hasError) reject();
  const allowed = hasError ? ERROR_PARAMETERS : SUCCESS_PARAMETERS;
  if (names.some((name) => !allowed.has(name))) reject();
  const state = exactSingle(search, "state", 1_024);
  if (state.length < 16) reject();
  const responseIssuer = exactResponseIssuer(search);
  if (hasCode) {
    return Object.freeze({
      kind: "success",
      callbackUrl,
      state,
      code: exactSingle(search, "code", 4_096),
      ...(responseIssuer ? { responseIssuer } : {}),
    });
  }
  const error = exactSingle(search, "error", 256);
  if (search.has("error_description")) exactSingle(search, "error_description", 1_024);
  if (search.has("error_uri")) exactSingle(search, "error_uri", 1_024);
  return Object.freeze({
    kind: "provider_error",
    callbackUrl,
    state,
    error,
    ...(responseIssuer ? { responseIssuer } : {}),
  });
}

export function validateCustomerPanelCallbackUrl(
  callbackUrl: string,
  publicCallbackAuthority: string,
  maximumQueryBytes: number,
): CustomerPanelCallbackRequest {
  if (typeof callbackUrl !== "string" || callbackUrl.length < 1 || callbackUrl.length > 16_384) reject();
  const authority = validateCustomerPanelCallbackAuthority(publicCallbackAuthority);
  return classify(callbackUrl, authority, boundedInteger(maximumQueryBytes));
}

function reconstructProxySafeCallbackUrl(
  request: Request,
  publicCallbackAuthority: string,
  maximumQueryBytes: number,
): string {
  let authority;
  try {
    authority = createCustomerPanelCallbackRequestAuthorityValidator({
      publicCallbackAuthority,
      maximumQueryBytes: boundedInteger(maximumQueryBytes),
    }).validate(request);
  } catch {
    return reject();
  }
  if (authority.kind === "method_not_allowed") reject(405);
  if (authority.kind === "query_too_large") reject(413);
  if (authority.kind !== "approved") reject();
  return authority.callbackUrl;
}

export function validateCustomerPanelCallbackRequest(
  request: Request,
  publicCallbackAuthority: string,
  maximumQueryBytes: number,
): CustomerPanelCallbackRequest {
  const callbackUrl = reconstructProxySafeCallbackUrl(request, publicCallbackAuthority, maximumQueryBytes);
  if (request.body != null || request.headers.has("content-length") || request.headers.has("transfer-encoding")) reject();
  for (const name of request.headers.keys()) if (name.startsWith("x-celebix-")) reject();
  for (const name of PRIVATE_HEADERS) if (request.headers.has(name)) reject();
  return validateCustomerPanelCallbackUrl(callbackUrl, publicCallbackAuthority, maximumQueryBytes);
}

export function validateBrowserBoundPanelCompletionRequest(
  request: Request,
  publicCallbackAuthority: string,
  maximumQueryBytes: number,
): BrowserBoundPanelCompletionRequest {
  const callbackUrl = reconstructProxySafeCallbackUrl(request, publicCallbackAuthority, maximumQueryBytes);
  if (request.body != null || request.headers.has("content-length") || request.headers.has("transfer-encoding")) reject();
  for (const name of request.headers.keys()) if (name.startsWith("x-celebix-")) reject();
  for (const name of PRIVATE_HEADERS) {
    if (name !== "cookie" && request.headers.has(name)) reject();
  }
  let browserBindingCredential: string;
  try { browserBindingCredential = parsePanelBrowserBindingCookie(request.headers.get("cookie")); }
  catch { return reject(); }
  const callback = validateCustomerPanelCallbackUrl(callbackUrl, publicCallbackAuthority, maximumQueryBytes);
  return Object.freeze({ ...callback, browserBindingCredential }) as BrowserBoundPanelCompletionRequest;
}
