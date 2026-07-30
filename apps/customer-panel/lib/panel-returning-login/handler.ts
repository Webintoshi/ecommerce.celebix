import type { createPanelBrowserBindingCredentialGenerator } from "../panel-browser-binding/credential-codec.ts";
import { serializePanelBrowserBindingCookie } from "../panel-browser-binding/cookie.ts";

type CredentialGenerator = ReturnType<typeof createPanelBrowserBindingCredentialGenerator>;

export type PanelReturningLoginStartResult = Readonly<
  | {
      kind: "panel_login_ready";
      providerAuthorizationUrl: string;
      browserBindingExpiresAt: string;
    }
  | { kind: "panel_login_unavailable"; retryable: false }
>;

function invalid(): never { throw new Error("panel_returning_login_handler_invalid"); }

function controlled(code: string, status: 400 | 405 | 503): Response {
  return Response.json({ code, retryable: false }, {
    status,
    headers: {
      "cache-control": "no-store",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
    },
  });
}

function exactPublicLoginAuthority(value: unknown): string {
  if (typeof value !== "string") invalid();
  let parsed: URL;
  try { parsed = new URL(value); } catch { return invalid(); }
  if (
    parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port ||
    parsed.pathname !== "/auth/login" || parsed.search || parsed.hash ||
    `${parsed.origin}${parsed.pathname}` !== value
  ) invalid();
  return value;
}

function requestDecision(request: Request): "approved" | "method_not_allowed" | "denied" {
  if (request.method !== "GET") return "method_not_allowed";
  let url: URL;
  try { url = new URL(request.url); } catch { return "denied"; }
  if (
    (url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password ||
    url.pathname !== "/auth/login" || url.search || url.hash
  ) return "denied";
  return "approved";
}

function providerUrl(value: unknown): string {
  if (typeof value !== "string" || !value || value.length > 16_384 || value.trim() !== value) invalid();
  let parsed: URL;
  try { parsed = new URL(value); } catch { return invalid(); }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port || parsed.hash || parsed.toString() !== value) invalid();
  return value;
}

function now(clock: () => Date): Date {
  const value = clock();
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) invalid();
  return new Date(value);
}

export function createPanelReturningLoginHandler(options: {
  publicLoginAuthority: string;
  credentialGenerator: CredentialGenerator;
  transport: { start(input: { browserBindingCredential: string }): Promise<PanelReturningLoginStartResult> };
  clock(): Date;
}) {
  exactPublicLoginAuthority(options?.publicLoginAuthority);
  if (
    !options.credentialGenerator || typeof options.credentialGenerator.generate !== "function" ||
    !options.transport || typeof options.transport.start !== "function" || typeof options.clock !== "function"
  ) invalid();
  now(options.clock);
  const generate = options.credentialGenerator.generate.bind(options.credentialGenerator);
  const start = options.transport.start.bind(options.transport);
  const clock = options.clock;

  return async function panelReturningLoginHandler(request: Request): Promise<Response> {
    const decision = requestDecision(request);
    if (decision === "method_not_allowed") return controlled("panel_login_method_not_allowed", 405);
    if (decision !== "approved") return controlled("panel_login_request_invalid", 400);

    let credential: string;
    let result: PanelReturningLoginStartResult;
    try {
      credential = generate();
      result = await start({ browserBindingCredential: credential });
    } catch {
      return controlled("panel_login_unavailable", 503);
    }
    if (result.kind !== "panel_login_ready") return controlled("panel_login_unavailable", 503);

    try {
      const location = providerUrl(result.providerAuthorizationUrl);
      const cookie = serializePanelBrowserBindingCookie({
        credential,
        expiresAt: result.browserBindingExpiresAt,
        now: now(clock),
      });
      return new Response(null, {
        status: 303,
        headers: {
          location,
          "set-cookie": cookie,
          "cache-control": "no-store",
          "referrer-policy": "no-referrer",
          "x-content-type-options": "nosniff",
        },
      });
    } catch {
      return controlled("panel_login_unavailable", 503);
    }
  };
}
