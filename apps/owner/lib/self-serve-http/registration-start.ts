import { isReservedSelfServeSlug } from "../self-serve-store-slug.ts";
import type { SelfServeRegistrationStartInput } from "../self-serve-registration-orchestrator.ts";
import {
  assertPersistentSelfServeRuntime,
  type PersistentSelfServeRuntime,
  type SelfServeHttpAuditEvent,
  type SelfServeRequestGateDecision,
  type SelfServeRuntime,
} from "./runtime.ts";

const ALLOWED_FIELDS = new Set(["storeName", "storeSlug", "marketingConsent", "privacyConsent"]);
const CONTENT_TYPES = new Set(["application/json", "application/x-www-form-urlencoded"]);

class RegistrationRequestError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
  ) {
    super(code);
  }
}

function json(body: Record<string, unknown>, status: number): Response {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

function message(code: string): string {
  const messages: Record<string, string> = {
    self_serve_register_read_disabled: "Kayıt endpointi yalnızca POST kabul eder.",
    self_serve_origin_required: "Güvenli kayıt için geçerli aynı-origin başlığı gerekli.",
    self_serve_unauthorized: "Kayıt isteği doğrulanamadı.",
    self_serve_forbidden: "Kayıt isteğine izin verilmedi.",
    self_serve_rate_limited: "Kayıt isteği şu anda sınırlandırıldı.",
    self_serve_request_gate_unavailable: "Kayıt güvenlik kontrolü şu anda kullanılamıyor.",
    self_serve_content_type_unsupported: "Kayıt içerik türü desteklenmiyor.",
    self_serve_request_too_large: "Kayıt isteği izin verilen boyutu aşıyor.",
    self_serve_request_malformed: "Kayıt isteği geçerli değil.",
    self_serve_registration_duplicate_field: "Kayıt isteğinde yinelenen alan bulunuyor.",
    self_serve_registration_unknown_field: "Kayıt isteğinde izin verilmeyen alan bulunuyor.",
    self_serve_registration_rejected: "Kayıt bilgileri kabul edilmedi.",
    self_serve_identity_start_failed: "Kimlik doğrulama başlangıcı güvenli şekilde tamamlanamadı.",
  };
  return messages[code] ?? "Kayıt isteği tamamlanamadı.";
}

function audit(
  runtime: PersistentSelfServeRuntime,
  event: Omit<SelfServeHttpAuditEvent, "operation">,
): void {
  runtime.audit({ operation: "registration_start", ...event });
}

function exactSameOrigin(request: Request, registrationOrigin: string): boolean {
  const raw = request.headers.get("origin");
  if (!raw || raw !== registrationOrigin) return false;
  try {
    const origin = new URL(raw);
    const target = new URL(request.url);
    return raw === origin.origin && !origin.username && !origin.password &&
      origin.pathname === "/" && !origin.search && !origin.hash &&
      origin.origin === registrationOrigin && target.origin === registrationOrigin;
  } catch {
    return false;
  }
}

function gateResponse(decision: Exclude<SelfServeRequestGateDecision, "allowed">): Response {
  const mapped = {
    unauthorized: { status: 401, code: "self_serve_unauthorized", retryable: false },
    forbidden: { status: 403, code: "self_serve_forbidden", retryable: false },
    rate_limited: { status: 429, code: "self_serve_rate_limited", retryable: true },
    unavailable: { status: 503, code: "self_serve_request_gate_unavailable", retryable: true },
  }[decision];
  return json({ code: mapped.code, state: "rejected", retryable: mapped.retryable, message: message(mapped.code) }, mapped.status);
}

function contentType(request: Request): "application/json" | "application/x-www-form-urlencoded" {
  const raw = request.headers.get("content-type") ?? "";
  const parts = raw.split(";").map((part) => part.trim().toLowerCase()).filter(Boolean);
  const mediaType = parts[0];
  if (!mediaType || !CONTENT_TYPES.has(mediaType) || parts.length > 2 || (parts[1] && parts[1] !== "charset=utf-8")) {
    throw new RegistrationRequestError("self_serve_content_type_unsupported", 415);
  }
  return mediaType as "application/json" | "application/x-www-form-urlencoded";
}

async function boundedUtf8Body(request: Request, maximumBytes: number): Promise<string> {
  const rawLength = request.headers.get("content-length");
  if (rawLength !== null) {
    if (!/^(?:0|[1-9][0-9]*)$/.test(rawLength)) {
      throw new RegistrationRequestError("self_serve_request_malformed", 400);
    }
    if (Number(rawLength) > maximumBytes) {
      throw new RegistrationRequestError("self_serve_request_too_large", 413);
    }
  }
  if (!request.body) throw new RegistrationRequestError("self_serve_request_malformed", 400);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    total += next.value.byteLength;
    if (total > maximumBytes) {
      void reader.cancel().catch(() => undefined);
      throw new RegistrationRequestError("self_serve_request_too_large", 413);
    }
    chunks.push(next.value);
  }
  const combined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(combined);
  } catch {
    throw new RegistrationRequestError("self_serve_request_malformed", 400);
  }
}

function skipWhitespace(value: string, position: number): number {
  while (position < value.length && /\s/.test(value[position])) position += 1;
  return position;
}

function readJsonString(value: string, position: number): { value: string; position: number } {
  if (value[position] !== '"') throw new RegistrationRequestError("self_serve_request_malformed", 400);
  let end = position + 1;
  let escaped = false;
  while (end < value.length) {
    const character = value[end];
    if (!escaped && character === '"') {
      const token = value.slice(position, end + 1);
      try { return { value: JSON.parse(token) as string, position: end + 1 }; }
      catch { throw new RegistrationRequestError("self_serve_request_malformed", 400); }
    }
    if (!escaped && character === "\\") escaped = true;
    else escaped = false;
    end += 1;
  }
  throw new RegistrationRequestError("self_serve_request_malformed", 400);
}

function parseStrictJsonObject(value: string): Record<string, string | boolean> {
  let position = skipWhitespace(value, 0);
  if (value[position] !== "{") throw new RegistrationRequestError("self_serve_request_malformed", 400);
  position = skipWhitespace(value, position + 1);
  const parsed: Record<string, string | boolean> = {};
  let closed = false;
  if (value[position] === "}") {
    position += 1;
    closed = true;
  }
  else {
    while (position < value.length) {
      const key = readJsonString(value, position);
      position = skipWhitespace(value, key.position);
      if (value[position] !== ":") throw new RegistrationRequestError("self_serve_request_malformed", 400);
      position = skipWhitespace(value, position + 1);
      let parsedValue: string | boolean;
      if (value[position] === '"') {
        const stringValue = readJsonString(value, position);
        parsedValue = stringValue.value;
        position = stringValue.position;
      } else if (value.startsWith("true", position)) {
        parsedValue = true;
        position += 4;
      } else if (value.startsWith("false", position)) {
        parsedValue = false;
        position += 5;
      } else {
        throw new RegistrationRequestError("self_serve_request_malformed", 400);
      }
      if (Object.hasOwn(parsed, key.value)) {
        throw new RegistrationRequestError("self_serve_registration_duplicate_field", 400);
      }
      parsed[key.value] = parsedValue;
      position = skipWhitespace(value, position);
      if (value[position] === "}") {
        position += 1;
        closed = true;
        break;
      }
      if (value[position] !== ",") throw new RegistrationRequestError("self_serve_request_malformed", 400);
      position = skipWhitespace(value, position + 1);
    }
  }
  if (!closed) throw new RegistrationRequestError("self_serve_request_malformed", 400);
  if (skipWhitespace(value, position) !== value.length) {
    throw new RegistrationRequestError("self_serve_request_malformed", 400);
  }
  return parsed;
}

function formComponent(value: string): string {
  try { return decodeURIComponent(value.replaceAll("+", " ")); }
  catch { throw new RegistrationRequestError("self_serve_request_malformed", 400); }
}

function parseStrictForm(value: string): Record<string, string | boolean> {
  const parsed: Record<string, string> = {};
  if (!value) throw new RegistrationRequestError("self_serve_request_malformed", 400);
  for (const pair of value.split("&")) {
    if (!pair) throw new RegistrationRequestError("self_serve_request_malformed", 400);
    const equals = pair.indexOf("=");
    const key = formComponent(equals < 0 ? pair : pair.slice(0, equals));
    const fieldValue = formComponent(equals < 0 ? "" : pair.slice(equals + 1));
    if (Object.hasOwn(parsed, key)) {
      throw new RegistrationRequestError("self_serve_registration_duplicate_field", 400);
    }
    parsed[key] = fieldValue;
  }
  const result: Record<string, string | boolean> = { ...parsed };
  for (const field of ["marketingConsent", "privacyConsent"] as const) {
    const raw = parsed[field];
    if (raw === undefined) {
      if (field === "marketingConsent") result[field] = false;
      continue;
    }
    if (raw !== "true" && raw !== "false") {
      throw new RegistrationRequestError("self_serve_registration_rejected", 400);
    }
    result[field] = raw === "true";
  }
  return result;
}

function registration(value: Record<string, string | boolean>): SelfServeRegistrationStartInput {
  for (const key of Object.keys(value)) {
    if (!ALLOWED_FIELDS.has(key)) {
      throw new RegistrationRequestError("self_serve_registration_unknown_field", 400);
    }
  }
  const storeName = value.storeName;
  const storeSlug = value.storeSlug;
  const marketingConsent = value.marketingConsent ?? false;
  const privacyConsent = value.privacyConsent;
  if (
    typeof storeName !== "string" || typeof storeSlug !== "string" ||
    typeof marketingConsent !== "boolean" || privacyConsent !== true
  ) throw new RegistrationRequestError("self_serve_registration_rejected", 400);
  const normalizedName = storeName.trim().replace(/\s+/g, " ");
  if (
    normalizedName.length < 1 || normalizedName.length > 120 ||
    storeSlug.length < 3 || storeSlug.length > 48 ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(storeSlug) || isReservedSelfServeSlug(storeSlug)
  ) throw new RegistrationRequestError("self_serve_registration_rejected", 400);
  return { storeName: normalizedName, storeSlug, marketingConsent, privacyConsent: true };
}

export function createSelfServeRegistrationStartHandler(runtime: SelfServeRuntime) {
  return async function selfServeRegistrationStartHandler(request: Request): Promise<Response> {
    if (request.method !== "POST") {
      return json({ code: "self_serve_register_read_disabled", message: message("self_serve_register_read_disabled") }, 405);
    }
    if (!exactSameOrigin(request, runtime.registrationOrigin)) {
      return json({ code: "self_serve_origin_required", message: message("self_serve_origin_required") }, 403);
    }
    if (runtime.kind === "disabled") {
      return json({
        code: "self_serve_saas_registration_disabled",
        state: "disabled",
        message: "Güvenli mağaza kayıt altyapısı henüz etkin değil.",
      }, 503);
    }
    assertPersistentSelfServeRuntime(runtime);

    let decision: SelfServeRequestGateDecision;
    try { decision = await runtime.verifyRequest({ kind: "registration_start", request }); }
    catch { decision = "unavailable"; }
    if (decision !== "allowed") {
      audit(runtime, { stage: "request_gate", outcome: "rejected", retryable: decision === "rate_limited" || decision === "unavailable", statusCategory: decision === "unavailable" ? "5xx" : "4xx" });
      return gateResponse(decision);
    }

    let parsed: SelfServeRegistrationStartInput;
    try {
      const mediaType = contentType(request);
      const raw = await boundedUtf8Body(request, runtime.bodyPolicy.maximumBytes);
      parsed = registration(mediaType === "application/json" ? parseStrictJsonObject(raw) : parseStrictForm(raw));
    } catch (error) {
      const controlled = error instanceof RegistrationRequestError
        ? error
        : new RegistrationRequestError("self_serve_request_malformed", 400);
      audit(runtime, { stage: "request_validation", outcome: "rejected", retryable: false, statusCategory: "4xx" });
      return json({ code: controlled.code, state: "rejected", retryable: false, message: message(controlled.code) }, controlled.status);
    }

    const result = await runtime.beginRegistration(parsed);
    if (!result.ok) {
      const code = result.code === "self_serve_registration_rejected"
        ? "self_serve_registration_rejected"
        : "self_serve_identity_start_failed";
      const status = code === "self_serve_registration_rejected" ? 400 : 503;
      audit(runtime, { stage: "persistence", outcome: "failed", retryable: status === 503, statusCategory: status === 503 ? "5xx" : "4xx" });
      return json({ code, state: "failed", retryable: status === 503, message: message(code) }, status);
    }
    audit(runtime, { stage: "persistence", outcome: "completed", retryable: false, statusCategory: "2xx" });
    return json({ state: result.state, authorizationUrl: result.authorizationUrl, expiresAt: result.expiresAt }, 201);
  };
}
