export type InternalHmacRequestAuthorityDecision =
  | "approved"
  | "method_not_allowed"
  | "request_invalid";

export type InternalHmacRequestAuthorityValidator = Readonly<{
  validate(request: unknown): InternalHmacRequestAuthorityDecision;
}>;

function invalid(): never {
  throw new Error("internal_hmac_request_authority_invalid");
}

function exactPathname(value: unknown): string {
  if (typeof value !== "string" || value.length < 1 || value.length > 2_048 || !value.startsWith("/")) invalid();
  try {
    const parsed = new URL(value, "https://internal-authority.invalid");
    if (parsed.pathname !== value || parsed.search || parsed.hash) invalid();
  } catch { return invalid(); }
  return value;
}

export function createInternalHmacRequestAuthorityValidator(options: {
  pathname: string;
}): InternalHmacRequestAuthorityValidator {
  if (!options || typeof options !== "object" || Array.isArray(options)) invalid();
  const pathname = exactPathname(options.pathname);

  return Object.freeze({
    validate(request: unknown): InternalHmacRequestAuthorityDecision {
      if (!(request instanceof Request) || request.method !== "POST") return "method_not_allowed";
      let requestUrl: URL;
      try { requestUrl = new URL(request.url); }
      catch { return "request_invalid"; }
      if (
        !["http:", "https:"].includes(requestUrl.protocol) ||
        requestUrl.pathname !== pathname || requestUrl.search || requestUrl.hash
      ) return "request_invalid";
      return "approved";
    },
  });
}
