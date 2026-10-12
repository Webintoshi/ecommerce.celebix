import { jwtVerify, type JWTVerifyGetKey } from "jose";
import { OidcFlowError } from "../self-serve-oidc.ts";
import { ADMIN_PASSWORD_PROOF_CLAIM, ADMIN_PASSWORD_PROOF_RESOURCE, ADMIN_PASSWORD_PROOF_SCOPE } from "./customizer.ts";

export type OidcVerifiedPasswordProof = Readonly<{
  method: "password";
  issuer: string;
  subject: string;
  clientId: string;
  nonce: string;
  tokenId: string;
  verificationId: string;
  verifiedAt: string;
  issuedAt: string;
  expiresAt: string;
}>;

function rejected(): never {
  throw new OidcFlowError("oidc_provider_rejected", "oidc_provider_rejected");
}

export async function verifyAdminPasswordProof(input: Readonly<{
  accessToken: string;
  jwks: JWTVerifyGetKey;
  issuer: string;
  clientId: string;
  subject: string;
  algorithms: readonly string[];
  now: Date;
}>): Promise<Omit<OidcVerifiedPasswordProof, "nonce" | "verifiedAt"> | undefined> {
  const { payload } = await jwtVerify(input.accessToken, input.jwks, {
    issuer: input.issuer,
    audience: ADMIN_PASSWORD_PROOF_RESOURCE,
    algorithms: [...input.algorithms],
    currentDate: input.now,
    clockTolerance: 0,
    requiredClaims: ["iat", "exp", "sub", "client_id", "scope", "jti"],
  });
  const nowSeconds = Math.floor(input.now.getTime() / 1000);
  if (
    payload.aud !== ADMIN_PASSWORD_PROOF_RESOURCE || payload.sub !== input.subject ||
    typeof payload.jti !== "string" || !payload.jti || payload.jti.length > 512 ||
    payload.jti.trim() !== payload.jti || /[\u0000-\u001f\u007f]/.test(payload.jti) ||
    payload.client_id !== input.clientId || typeof payload.scope !== "string" ||
    !payload.scope.split(" ").includes(ADMIN_PASSWORD_PROOF_SCOPE) ||
    !Number.isSafeInteger(payload.iat) || !Number.isSafeInteger(payload.exp) ||
    payload.iat! > nowSeconds + 30 || payload.iat! < nowSeconds - 600 ||
    payload.exp! <= nowSeconds || payload.exp! <= payload.iat!
  ) rejected();
  const proof = payload[ADMIN_PASSWORD_PROOF_CLAIM];
  if (proof === undefined) return undefined;
  if (!proof || typeof proof !== "object" || Array.isArray(proof)) rejected();
  const row = proof as Record<string, unknown>;
  if (
    Object.keys(row).sort().join(",") !== "clientId,method,subject,tokenId,verificationId,version" ||
    row.version !== 3 || row.method !== "password" || row.tokenId !== payload.jti ||
    row.subject !== input.subject || row.clientId !== input.clientId ||
    typeof row.verificationId !== "string" || !/^[a-z0-9]{21}$/.test(row.verificationId)
  ) rejected();
  return Object.freeze({
    method: "password", issuer: input.issuer, subject: input.subject,
    clientId: input.clientId, tokenId: payload.jti!, verificationId: row.verificationId as string,
    issuedAt: new Date(payload.iat! * 1000).toISOString(), expiresAt: new Date(payload.exp! * 1000).toISOString(),
  });
}
