import { PANEL_BROWSER_BOOTSTRAP_URL } from "../../../../packages/platform-config/src/saas.ts";
import type { createPanelBrowserBindingCredentialGenerator } from "../panel-browser-binding/credential-codec.ts";
import { serializePanelBrowserBindingCookie } from "../panel-browser-binding/cookie.ts";
import { assertPanelBrowserBindingBootstrapApproval } from "./activation.ts";
import type { PanelBrowserBindingInternalResult } from "./transport.ts";

type CredentialGenerator = ReturnType<typeof createPanelBrowserBindingCredentialGenerator>;
type Audit = (event: Readonly<{
  stage: "request" | "credential" | "owner" | "browser_response";
  outcome: "completed" | "rejected" | "unavailable";
}>) => void | Promise<void>;

function invalid(): never { throw new Error("panel_browser_binding_bootstrap_invalid"); }

function auditSafely(audit: Audit, event: Parameters<Audit>[0]): void {
  try { void Promise.resolve(audit(Object.freeze({ ...event }))).catch(() => undefined); }
  catch { /* Audit is observational only. */ }
}

function headers(): Record<string, string> {
  return {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
  };
}

function failure(code: string, status: 400 | 405 | 409 | 413 | 415 | 503): Response {
  return new Response(JSON.stringify({ code, retryable: false, freshLoginRequired: true }), { status, headers: headers() });
}

function trustedNow(clock: () => Date): Date {
  const value = clock();
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) invalid();
  return new Date(value);
}

async function boundedBody(request: Request, maximumBytes: number): Promise<string> {
  const declared = request.headers.get("content-length");
  if (declared !== null && (!/^\d+$/.test(declared) || !Number.isSafeInteger(Number(declared)))) throw new Error("invalid");
  if (declared !== null && Number(declared) > maximumBytes) throw new Error("too_large");
  if (!request.body) throw new Error("invalid");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maximumBytes) throw new Error("too_large");
      chunks.push(value);
    }
  } catch (error) {
    void reader.cancel().catch(() => undefined);
    throw error;
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

function decode(value: string): string {
  try { return decodeURIComponent(value.replaceAll("+", " ")); }
  catch { throw new Error("invalid"); }
}

function parseForm(raw: string): { bootstrapCredential: string; providerAuthorizationUrl: string } {
  if (!raw) throw new Error("invalid");
  const values = new Map<string, string>();
  for (const pair of raw.split("&")) {
    if (!pair) throw new Error("invalid");
    const separator = pair.indexOf("=");
    const key = decode(separator < 0 ? pair : pair.slice(0, separator));
    const value = decode(separator < 0 ? "" : pair.slice(separator + 1));
    if (values.has(key) || !["bootstrapCredential", "providerAuthorizationUrl"].includes(key) ||
        !value || value.trim() !== value || /[\u0000-\u001f\u007f]/.test(value)) throw new Error("invalid");
    values.set(key, value);
  }
  if (values.size !== 2) throw new Error("invalid");
  return {
    bootstrapCredential: values.get("bootstrapCredential")!,
    providerAuthorizationUrl: values.get("providerAuthorizationUrl")!,
  };
}

export function createPanelBrowserBindingBootstrapHandler(options: {
  activationApproval: unknown;
  publicBootstrapAuthority: string;
  maximumBodyBytes: number;
  credentialGenerator: CredentialGenerator;
  transport: { bind(input: {
    bootstrapCredential: string;
    providerAuthorizationUrl: string;
    browserBindingCredential: string;
  }): Promise<PanelBrowserBindingInternalResult> };
  clock(): Date;
  audit: Audit;
}) {
  assertPanelBrowserBindingBootstrapApproval(options?.activationApproval);
  if (options.publicBootstrapAuthority !== PANEL_BROWSER_BOOTSTRAP_URL ||
      !Number.isSafeInteger(options.maximumBodyBytes) || options.maximumBodyBytes < 1 || options.maximumBodyBytes > 16_384 ||
      !options.credentialGenerator || typeof options.credentialGenerator.generate !== "function" ||
      !options.transport || typeof options.transport.bind !== "function" ||
      typeof options.clock !== "function" || typeof options.audit !== "function") invalid();
  trustedNow(options.clock);
  const maximumBodyBytes = options.maximumBodyBytes;
  const generate = options.credentialGenerator.generate.bind(options.credentialGenerator);
  const bind = options.transport.bind.bind(options.transport);
  const clock = options.clock;
  const audit = options.audit;

  return async function panelBrowserBindingBootstrapHandler(request: Request): Promise<Response> {
    if (!(request instanceof Request) || request.method !== "POST") return failure("panel_browser_binding_method_not_allowed", 405);
    if (request.url !== PANEL_BROWSER_BOOTSTRAP_URL) return failure("panel_browser_binding_request_invalid", 400);
    if (request.headers.get("content-type") !== "application/x-www-form-urlencoded") return failure("panel_browser_binding_content_type_invalid", 415);
    if (request.headers.has("cookie") || request.headers.has("authorization")) return failure("panel_browser_binding_request_invalid", 400);
    for (const name of request.headers.keys()) if (name.startsWith("x-celebix-")) return failure("panel_browser_binding_request_invalid", 400);

    let form: ReturnType<typeof parseForm>;
    try { form = parseForm(await boundedBody(request, maximumBodyBytes)); }
    catch (error) {
      auditSafely(audit, { stage: "request", outcome: "rejected" });
      return failure("panel_browser_binding_request_invalid", error instanceof Error && error.message === "too_large" ? 413 : 400);
    }

    let browserBindingCredential: string;
    try { browserBindingCredential = generate(); }
    catch {
      auditSafely(audit, { stage: "credential", outcome: "unavailable" });
      return failure("panel_browser_binding_unavailable", 503);
    }

    let result: PanelBrowserBindingInternalResult;
    try {
      result = await bind({ ...form, browserBindingCredential });
    } catch {
      auditSafely(audit, { stage: "owner", outcome: "unavailable" });
      return failure("panel_browser_binding_unavailable", 503);
    }
    if (result.kind !== "browser_binding_ready" || result.providerAuthorizationUrl !== form.providerAuthorizationUrl) {
      auditSafely(audit, { stage: "owner", outcome: result.kind === "browser_binding_rejected" && result.code === "browser_binding_unavailable" ? "unavailable" : "rejected" });
      return failure("panel_browser_binding_fresh_login_required", result.kind === "browser_binding_rejected" && result.code === "browser_binding_unavailable" ? 503 : 409);
    }

    try {
      const cookie = serializePanelBrowserBindingCookie({
        credential: browserBindingCredential,
        expiresAt: result.browserBindingExpiresAt,
        now: trustedNow(clock),
      });
      auditSafely(audit, { stage: "browser_response", outcome: "completed" });
      return new Response(null, {
        status: 303,
        headers: {
          location: form.providerAuthorizationUrl,
          "set-cookie": cookie,
          "cache-control": "no-store",
          "referrer-policy": "no-referrer",
          "x-content-type-options": "nosniff",
        },
      });
    } catch {
      auditSafely(audit, { stage: "browser_response", outcome: "rejected" });
      return failure("panel_browser_binding_fresh_login_required", 409);
    }
  };
}
