import { createLocalJWKSet, jwtVerify, type JSONWebKeySet } from "jose";

import {
  OidcFlowError,
  type OidcAuthorizationRequest,
  type OidcProviderCallbackInput,
  type OidcProviderPort,
  type OidcVerifiedIdentity,
} from "../self-serve-oidc.ts";

const ASYMMETRIC_ALGORITHMS = new Set([
  "RS256", "RS384", "RS512", "PS256", "PS384", "PS512", "ES256", "ES384", "ES512", "EdDSA",
]);
const CONTROL = /[\u0000-\u001f\u007f]/;
const MEDIA_TYPE = /^([!#$%&'*+\-.^_`|~A-Za-z0-9]+)\/([!#$%&'*+\-.^_`|~A-Za-z0-9]+)(?:[ \t]*;[ \t]*[!#$%&'*+\-.^_`|~A-Za-z0-9]+[ \t]*=[ \t]*(?:[!#$%&'*+\-.^_`|~A-Za-z0-9]+|"(?:[\t !#-\[\]-~]|\\[\t -~])*"))*[ \t]*$/;
const JSON_MEDIA_TYPES = Object.freeze(["application/json"]);
const JWKS_MEDIA_TYPES = Object.freeze(["application/jwk-set+json", "application/json"]);

type Fetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export type LogtoOidcProviderAuditEvent = Readonly<{
  stage:
    | "token_response"
    | "jwks_response"
    | "id_token_verification"
    | "id_token_time_nonce"
    | "id_token_identity"
    | "id_token_audience";
  outcome: "accepted" | "rejected" | "unavailable";
}>;

export type LogtoOidcProviderOptions = Readonly<{
  issuer: string;
  discoveryUrl: string;
  clientId: string;
  clientSecret: string;
  tokenAuthMethod: "client_secret_basic" | "client_secret_post";
  algorithms: readonly string[];
  fetch: Fetch;
  clock(): Date;
  timeoutMs: number;
  maximumResponseBytes: number;
  audit?(event: LogtoOidcProviderAuditEvent): void | Promise<void>;
}>;

type Discovery = Readonly<{
  issuer: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  jwksUri: string;
}>;

function rejected(): never {
  throw new OidcFlowError("oidc_provider_rejected", "oidc_provider_rejected");
}

function unavailable(): never {
  throw new OidcFlowError("oidc_provider_unavailable", "oidc_provider_unavailable");
}

function exactText(value: unknown, maximum: number): string {
  if (
    typeof value !== "string" || !value || value.trim() !== value ||
    value.length > maximum || CONTROL.test(value)
  ) rejected();
  return value;
}

function exactHttpsUrl(value: unknown, maximum = 2048): URL {
  const text = exactText(value, maximum);
  let parsed: URL;
  try { parsed = new URL(text); } catch { return rejected(); }
  if (
    parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash ||
    parsed.toString() !== text
  ) rejected();
  return parsed;
}

function exactObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) rejected();
  return value as Record<string, unknown>;
}

function responseMediaType(value: string | null): string {
  if (value === null || CONTROL.test(value)) rejected();
  const parsed = MEDIA_TYPE.exec(value);
  if (!parsed) rejected();
  return `${parsed[1]?.toLowerCase()}/${parsed[2]?.toLowerCase()}`;
}

function boundedInteger(value: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) rejected();
  return value;
}

function safeClock(clock: () => Date): Date {
  const value = clock();
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) unavailable();
  return new Date(value);
}

async function fetchJson(
  fetcher: Fetch,
  url: string,
  init: RequestInit,
  timeoutMs: number,
  maximumResponseBytes: number,
  acceptedMediaTypes: readonly string[],
): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new OidcFlowError("oidc_provider_unavailable", "oidc_provider_unavailable"));
    }, timeoutMs);
  });
  const operation = async (): Promise<Record<string, unknown>> => {
    const response = await fetcher(url, { ...init, redirect: "manual", signal: controller.signal });
    if (!(response instanceof Response) || response.status !== 200) rejected();
    const contentType = responseMediaType(response.headers.get("content-type"));
    if (!acceptedMediaTypes.includes(contentType)) rejected();
    const declared = response.headers.get("content-length");
    if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > maximumResponseBytes)) rejected();
    if (!response.body) rejected();
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maximumResponseBytes) {
        void reader.cancel().catch(() => undefined);
        rejected();
      }
      chunks.push(value);
    }
    if (length < 2) rejected();
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    let parsed: unknown;
    try { parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
    catch { return rejected(); }
    return exactObject(parsed);
  };
  try {
    return await Promise.race([operation(), timeout]);
  } catch (error) {
    if (error instanceof OidcFlowError) throw error;
    return unavailable();
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function stringArray(value: unknown): readonly string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 32) rejected();
  const parsed = value.map((item) => exactText(item, 64));
  return Object.freeze(parsed);
}

export function createLogtoOidcProvider(options: LogtoOidcProviderOptions): OidcProviderPort {
  if (!options || typeof options !== "object") rejected();
  const issuerUrl = exactHttpsUrl(options.issuer);
  const discoveryUrl = exactHttpsUrl(options.discoveryUrl);
  const issuer = issuerUrl.toString().replace(/\/$/, "");
  if (
    issuer !== options.issuer || discoveryUrl.origin !== issuerUrl.origin ||
    discoveryUrl.pathname !== `${issuerUrl.pathname.replace(/\/$/, "")}/.well-known/openid-configuration`
  ) rejected();
  const clientId = exactText(options.clientId, 256);
  const clientSecret = exactText(options.clientSecret, 1024);
  if (options.tokenAuthMethod !== "client_secret_basic" && options.tokenAuthMethod !== "client_secret_post") rejected();
  if (
    !Array.isArray(options.algorithms) || options.algorithms.length < 1 || options.algorithms.length > 8 ||
    new Set(options.algorithms).size !== options.algorithms.length ||
    options.algorithms.some((algorithm) => !ASYMMETRIC_ALGORITHMS.has(algorithm))
  ) rejected();
  if (typeof options.fetch !== "function" || typeof options.clock !== "function") rejected();
  const timeoutMs = boundedInteger(options.timeoutMs, 10_000);
  const maximumResponseBytes = boundedInteger(options.maximumResponseBytes, 1_048_576);
  const algorithms = Object.freeze([...options.algorithms]);
  const fetcher = options.fetch;
  if (options.audit !== undefined && typeof options.audit !== "function") rejected();
  const auditSink = options.audit;
  const audit = (event: LogtoOidcProviderAuditEvent): void => {
    if (!auditSink) return;
    try {
      const pending = auditSink(Object.freeze({ ...event }));
      if (pending && typeof (pending as PromiseLike<void>).then === "function") {
        void Promise.resolve(pending).catch(() => undefined);
      }
    } catch {
      // Provider diagnostics are observational only.
    }
  };
  const failedOutcome = (error: unknown): "rejected" | "unavailable" =>
    error instanceof OidcFlowError && error.code === "oidc_provider_unavailable"
      ? "unavailable"
      : "rejected";
  safeClock(options.clock);

  let discoveryPromise: Promise<Discovery> | undefined;
  const loadDiscovery = (): Promise<Discovery> => {
    discoveryPromise ??= (async () => {
      const document = await fetchJson(fetcher, options.discoveryUrl, {
        method: "GET",
        headers: { accept: "application/json" },
      }, timeoutMs, maximumResponseBytes, JSON_MEDIA_TYPES);
      if (exactText(document.issuer, 2048) !== issuer) rejected();
      const authorizationEndpoint = exactHttpsUrl(document.authorization_endpoint).toString();
      const tokenEndpoint = exactHttpsUrl(document.token_endpoint).toString();
      const jwksUri = exactHttpsUrl(document.jwks_uri).toString();
      if (
        [authorizationEndpoint, tokenEndpoint, jwksUri].some((value) => new URL(value).origin !== issuerUrl.origin)
      ) rejected();
      if (!stringArray(document.token_endpoint_auth_methods_supported).includes(options.tokenAuthMethod)) rejected();
      const providerAlgorithms = stringArray(document.id_token_signing_alg_values_supported);
      if (algorithms.some((algorithm) => !providerAlgorithms.includes(algorithm))) rejected();
      return Object.freeze({ issuer, authorizationEndpoint, tokenEndpoint, jwksUri });
    })();
    return discoveryPromise;
  };

  let jwksPromise: Promise<ReturnType<typeof createLocalJWKSet>> | undefined;
  const loadJwks = async (discovery: Discovery): Promise<ReturnType<typeof createLocalJWKSet>> => {
    jwksPromise ??= (async () => {
      const document = await fetchJson(fetcher, discovery.jwksUri, {
        method: "GET",
        headers: { accept: "application/jwk-set+json, application/json" },
      }, timeoutMs, maximumResponseBytes, JWKS_MEDIA_TYPES);
      if (!Array.isArray(document.keys) || document.keys.length < 1 || document.keys.length > 32) rejected();
      return createLocalJWKSet(document as unknown as JSONWebKeySet);
    })();
    return jwksPromise;
  };

  return Object.freeze({
    async buildAuthorizationUrl(input: OidcAuthorizationRequest): Promise<URL> {
      const discovery = await loadDiscovery();
      if (!input || input.codeChallengeMethod !== "S256") rejected();
      const url = new URL(discovery.authorizationEndpoint);
      const values = [
        ["response_type", "code"], ["response_mode", "query"], ["scope", "openid profile email"],
        ["client_id", clientId], ["redirect_uri", exactText(input.redirectUri, 2048)],
        ["state", exactText(input.state, 1024)], ["nonce", exactText(input.nonce, 512)],
        ["code_challenge", exactText(input.codeChallenge, 512)], ["code_challenge_method", "S256"],
      ] as const;
      for (const [name, value] of values) url.searchParams.set(name, value);
      return url;
    },

    async verifyCallback(input: OidcProviderCallbackInput): Promise<OidcVerifiedIdentity> {
      const discovery = await loadDiscovery();
      if (!input || input.expectedIssuer !== issuer || input.expectedAudience !== clientId) rejected();
      exactText(input.state, 1_024);
      const expectedNonce = exactText(input.expectedNonce, 512);
      const body = new URLSearchParams({
        grant_type: "authorization_code",
        code: exactText(input.code, 4096),
        redirect_uri: exactText(input.redirectUri, 2048),
        code_verifier: exactText(input.codeVerifier, 512),
      });
      const headers: Record<string, string> = {
        accept: "application/json",
        "content-type": "application/x-www-form-urlencoded",
      };
      if (options.tokenAuthMethod === "client_secret_basic") {
        headers.authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`, "utf8").toString("base64")}`;
      } else {
        body.set("client_id", clientId);
        body.set("client_secret", clientSecret);
      }
      let idToken: string;
      try {
        const tokenResponse = await fetchJson(fetcher, discovery.tokenEndpoint, {
          method: "POST",
          headers,
          body: body.toString(),
        }, timeoutMs, maximumResponseBytes, JSON_MEDIA_TYPES);
        idToken = exactText(tokenResponse.id_token, maximumResponseBytes);
      } catch (error) {
        audit({ stage: "token_response", outcome: failedOutcome(error) });
        throw error;
      }
      audit({ stage: "token_response", outcome: "accepted" });
      let localJwks: ReturnType<typeof createLocalJWKSet>;
      try {
        localJwks = await loadJwks(discovery);
      } catch (error) {
        audit({ stage: "jwks_response", outcome: failedOutcome(error) });
        throw error;
      }
      audit({ stage: "jwks_response", outcome: "accepted" });
      let verified: Awaited<ReturnType<typeof jwtVerify>>;
      const currentDate = safeClock(options.clock);
      try {
        verified = await jwtVerify(idToken, localJwks, {
          issuer,
          audience: clientId,
          algorithms: [...algorithms],
          currentDate,
          clockTolerance: 0,
        });
      } catch {
        audit({ stage: "id_token_verification", outcome: "rejected" });
        return rejected();
      }
      audit({ stage: "id_token_verification", outcome: "accepted" });
      const payload = verified.payload;
      const issuedAt = payload.iat;
      const expiresAt = payload.exp;
      const nowSeconds = Math.floor(currentDate.getTime() / 1000);
      if (
        !Number.isSafeInteger(issuedAt) || !Number.isSafeInteger(expiresAt) ||
        (issuedAt as number) > nowSeconds + 30 || (issuedAt as number) < nowSeconds - 600 ||
        (expiresAt as number) <= nowSeconds || payload.nonce !== expectedNonce
      ) {
        audit({ stage: "id_token_time_nonce", outcome: "rejected" });
        rejected();
      }
      audit({ stage: "id_token_time_nonce", outcome: "accepted" });
      let subject: string;
      let email: string;
      let displayName: string | undefined;
      try {
        subject = exactText(payload.sub, 512);
        email = exactText(payload.email, 320);
        if (payload.email_verified !== true || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) rejected();
        displayName = payload.name == null ? undefined : exactText(payload.name, 256);
      } catch (error) {
        audit({ stage: "id_token_identity", outcome: failedOutcome(error) });
        throw error;
      }
      audit({ stage: "id_token_identity", outcome: "accepted" });
      const audience = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
      if (
        audience.some((value) => typeof value !== "string") || !audience.includes(clientId) ||
        new Set(audience).size !== audience.length ||
        (audience.length > 1 && payload.azp !== clientId) ||
        (payload.azp !== undefined && payload.azp !== clientId)
      ) {
        audit({ stage: "id_token_audience", outcome: "rejected" });
        rejected();
      }
      audit({ stage: "id_token_audience", outcome: "accepted" });
      return Object.freeze({
        issuer,
        subject,
        audience: Object.freeze(audience as string[]),
        nonce: expectedNonce,
        email,
        emailVerified: true,
        ...(displayName === undefined ? {} : { displayName }),
      });
    },
  });
}
