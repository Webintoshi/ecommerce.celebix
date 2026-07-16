export type CustomerPanelCallbackRequestAuthorityDecision = Readonly<
  | { kind: "approved"; callbackUrl: string }
  | { kind: "method_not_allowed" }
  | { kind: "query_too_large" }
  | { kind: "request_invalid" }
>;

export type CustomerPanelCallbackRequestAuthorityValidator = Readonly<{
  validate(request: unknown): CustomerPanelCallbackRequestAuthorityDecision;
}>;

function invalidConfiguration(): never {
  throw new Error("customer_panel_callback_request_authority_invalid");
}

export function validatePublicCustomerPanelCallbackAuthority(value: unknown): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 2_048) invalidConfiguration();
  let parsed: URL;
  try { parsed = new URL(value); } catch { return invalidConfiguration(); }
  if (
    parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port ||
    parsed.pathname !== "/auth/callback" || parsed.search || parsed.hash ||
    `${parsed.origin}${parsed.pathname}` !== value
  ) invalidConfiguration();
  return value;
}

function exactMaximumQueryBytes(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > 16_384) {
    invalidConfiguration();
  }
  return value as number;
}

export function createCustomerPanelCallbackRequestAuthorityValidator(options: {
  publicCallbackAuthority: string;
  maximumQueryBytes: number;
}): CustomerPanelCallbackRequestAuthorityValidator {
  if (!options || typeof options !== "object" || Array.isArray(options)) invalidConfiguration();
  const publicCallbackAuthority = validatePublicCustomerPanelCallbackAuthority(options.publicCallbackAuthority);
  const maximumQueryBytes = exactMaximumQueryBytes(options.maximumQueryBytes);

  return Object.freeze({
    validate(request: unknown): CustomerPanelCallbackRequestAuthorityDecision {
      if (!request || typeof request !== "object" || Array.isArray(request)) {
        return Object.freeze({ kind: "request_invalid" });
      }
      const candidate = request as { method?: unknown; url?: unknown };
      if (candidate.method !== "GET") return Object.freeze({ kind: "method_not_allowed" });
      if (typeof candidate.url !== "string") return Object.freeze({ kind: "request_invalid" });

      let requestUrl: URL;
      try { requestUrl = new URL(candidate.url); } catch { return Object.freeze({ kind: "request_invalid" }); }
      if (
        !["http:", "https:"].includes(requestUrl.protocol) || requestUrl.username || requestUrl.password ||
        requestUrl.pathname !== "/auth/callback" || requestUrl.hash
      ) return Object.freeze({ kind: "request_invalid" });

      const queryMarker = candidate.url.indexOf("?");
      if (queryMarker < 0) return Object.freeze({ kind: "request_invalid" });
      const rawQuery = candidate.url.slice(queryMarker + 1);
      if (!rawQuery) return Object.freeze({ kind: "request_invalid" });
      if (new TextEncoder().encode(rawQuery).byteLength > maximumQueryBytes) {
        return Object.freeze({ kind: "query_too_large" });
      }

      return Object.freeze({
        kind: "approved",
        callbackUrl: `${publicCallbackAuthority}?${rawQuery}`,
      });
    },
  });
}
