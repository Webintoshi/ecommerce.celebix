import { createHash, randomBytes } from "node:crypto";

export function createLogtoPkce() {
  const codeVerifier = randomBytes(48).toString("base64url");
  const codeChallenge = createHash("sha256")
    .update(codeVerifier, "utf8")
    .digest("base64url");

  return { codeVerifier, codeChallenge };
}

export function createLogtoTokenExchangeBody(input: {
  clientId: string;
  code: string;
  codeVerifier: string;
  redirectUri: string;
}) {
  return new URLSearchParams({
    grant_type: "authorization_code",
    client_id: input.clientId,
    code: input.code,
    code_verifier: input.codeVerifier,
    redirect_uri: input.redirectUri,
  });
}

const SAFE_OAUTH_IDENTIFIER = /^[A-Za-z0-9._-]{1,80}$/;

export function sanitizeLogtoTokenError(input: unknown): {
  error?: string;
  code?: string;
} {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {};
  }

  const record = input as Record<string, unknown>;
  const error =
    typeof record.error === "string" && SAFE_OAUTH_IDENTIFIER.test(record.error)
      ? record.error
      : undefined;
  const code =
    typeof record.code === "string" && SAFE_OAUTH_IDENTIFIER.test(record.code)
      ? record.code
      : undefined;

  return {
    ...(error ? { error } : {}),
    ...(code ? { code } : {}),
  };
}
