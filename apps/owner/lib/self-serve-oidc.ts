import { PANEL_OIDC_CALLBACK_URL } from "../../../packages/platform-config/src/saas.ts";
import { parseExactAdminHttpsOrigin } from "@celebix/saas-data";

const OIDC_TRANSACTION_LIFETIME_MS = 10 * 60_000;
const APPROVED_RETURN_PATHS = new Set(["/kayit", "/login"]);
const KEY_ID = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,62}[A-Za-z0-9])?$/;
const DIGEST = /^[a-f0-9]{64}$/;

export type OidcFlowErrorCode =
  | "oidc_disabled"
  | "oidc_invalid_state"
  | "oidc_state_replayed"
  | "oidc_state_expired"
  | "oidc_nonce_mismatch"
  | "oidc_issuer_mismatch"
  | "oidc_audience_mismatch"
  | "oidc_invalid_callback"
  | "oidc_provider_unavailable"
  | "oidc_provider_rejected";

export class OidcFlowError extends Error {
  readonly code: OidcFlowErrorCode;

  constructor(
    code: OidcFlowErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "OidcFlowError";
    this.code = code;
  }
}

export interface OidcAuthorizationRequest {
  state: string;
  nonce: string;
  codeChallenge: string;
  codeChallengeMethod: "S256";
  redirectUri: string;
  prompt?: "login";
}

export interface OidcCallbackInput {
  code: string;
  state: string;
  responseIssuer?: string;
}

export interface OidcProviderCallbackInput extends OidcCallbackInput {
  codeVerifier: string;
  redirectUri: string;
  expectedNonce: string;
  expectedIssuer: string;
  expectedAudience: string;
}

export interface OidcVerifiedIdentity {
  issuer: string;
  subject: string;
  audience: readonly string[];
  nonce: string;
  email: string;
  emailVerified: boolean;
  displayName?: string;
}

export interface OidcProviderPort {
  buildAuthorizationUrl(input: OidcAuthorizationRequest): URL | Promise<URL>;
  verifyCallback(input: OidcProviderCallbackInput): Promise<OidcVerifiedIdentity>;
}

export interface OidcAuthorizationTransaction {
  state: string;
  nonce: string;
  codeVerifier: string;
  redirectUri: string;
  returnTo: string;
  expectedIssuer: string;
  expectedAudience: string;
  createdAt: string;
  expiresAt: string;
  panelLoginBinding?: Readonly<{ keyId: string; digest: string }>;
  panelLoginDestinationHostname?: string;
}

export interface OidcTransactionStore {
  save(transaction: OidcAuthorizationTransaction): Promise<void>;
  consume(state: string, now: Date): Promise<OidcAuthorizationTransaction>;
  discard(state: string): Promise<void>;
}

export interface BeginOidcAuthorizationInput {
  provider: OidcProviderPort;
  transactionStore: OidcTransactionStore;
  redirectUri: string;
  returnTo: string;
  expectedIssuer: string;
  expectedAudience: string;
  expectedAuthorizationOrigin?: string;
  expectedCallbackAuthority?: string;
  returnOrigin?: string;
  allowInsecureLocalAuthorization?: boolean;
  allowLocalTestCallback?: boolean;
  panelLoginBinding?: Readonly<{ keyId: string; digest: string }>;
  panelLoginDestinationHostname?: string;
  now?: () => Date;
}

export interface CompleteOidcCallbackInput {
  provider: OidcProviderPort;
  transactionStore: OidcTransactionStore;
  callback: OidcCallbackInput;
  panelLoginBinding?: Readonly<{ keyId: string; digest: string }>;
  now?: () => Date;
}

export interface RejectOidcProviderCallbackInput {
  transactionStore: OidcTransactionStore;
  state: string;
  responseIssuer?: string;
  now?: () => Date;
}

function randomOpaqueValue(byteLength: number, prefix = "") {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return `${prefix}${Buffer.from(bytes).toString("base64url")}`;
}

function exactPanelLoginBinding(value: unknown): Readonly<{ keyId: string; digest: string }> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new OidcFlowError("oidc_invalid_callback", "OIDC panel login binding is invalid.");
  }
  const row = value as Record<string, unknown>;
  if (
    Object.keys(row).join(",") !== "keyId,digest" || typeof row.keyId !== "string" ||
    !KEY_ID.test(row.keyId) || row.keyId.includes("..") || typeof row.digest !== "string" || !DIGEST.test(row.digest)
  ) throw new OidcFlowError("oidc_invalid_callback", "OIDC panel login binding is invalid.");
  return Object.freeze({ keyId: row.keyId, digest: row.digest });
}

function exactPanelLoginDestinationHostname(value: unknown): string {
  try {
    if (typeof value !== "string") throw new Error("invalid");
    const hostname = parseExactAdminHttpsOrigin(`https://${value}`).hostname;
    if (hostname !== value) throw new Error("invalid");
    return hostname;
  } catch {
    throw new OidcFlowError("oidc_invalid_callback", "OIDC panel login destination is invalid.");
  }
}

async function createS256Challenge(verifier: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return Buffer.from(digest).toString("base64url");
}

export function sanitizeOidcReturnTo(value: string, returnOrigin = "https://ecommerce.celebix.co") {
  try {
    const origin = new URL(returnOrigin);
    if (
      origin.protocol !== "https:" || origin.username || origin.password || origin.pathname !== "/" ||
      origin.search || origin.hash || origin.origin !== returnOrigin
    ) return "/kayit";
    const parsed = new URL(value, returnOrigin);
    if (parsed.origin !== returnOrigin || !APPROVED_RETURN_PATHS.has(parsed.pathname)) {
      return "/kayit";
    }
    return parsed.pathname;
  } catch {
    return "/kayit";
  }
}

export class InMemoryOidcTransactionStore implements OidcTransactionStore {
  private readonly active = new Map<string, OidcAuthorizationTransaction>();
  private readonly consumed = new Set<string>();

  async save(transaction: OidcAuthorizationTransaction) {
    if (this.active.has(transaction.state) || this.consumed.has(transaction.state)) {
      throw new OidcFlowError("oidc_invalid_state", "OIDC state handle already exists.");
    }
    this.active.set(transaction.state, structuredClone(transaction));
  }

  async consume(state: string, now: Date) {
    if (this.consumed.has(state)) {
      throw new OidcFlowError("oidc_state_replayed", "OIDC state was already consumed.");
    }

    const transaction = this.active.get(state);
    if (!transaction) {
      throw new OidcFlowError("oidc_invalid_state", "OIDC state is invalid.");
    }

    this.active.delete(state);
    this.consumed.add(state);

    if (Date.parse(transaction.expiresAt) <= now.getTime()) {
      throw new OidcFlowError("oidc_state_expired", "OIDC state has expired.");
    }

    return structuredClone(transaction);
  }

  async discard(state: string) {
    this.active.delete(state);
  }
}

/** Production placeholder: server persistence must be wired before activation. */
export class DisabledOidcTransactionStore implements OidcTransactionStore {
  async save() {
    throw new OidcFlowError("oidc_disabled", "OIDC transaction persistence is disabled.");
  }

  async consume(): Promise<OidcAuthorizationTransaction> {
    throw new OidcFlowError("oidc_disabled", "OIDC transaction persistence is disabled.");
  }

  async discard() {
    throw new OidcFlowError("oidc_disabled", "OIDC transaction persistence is disabled.");
  }
}

/** Production placeholder: no provider SDK or network client is configured in Phase 1. */
export class DisabledOidcProvider implements OidcProviderPort {
  buildAuthorizationUrl(): URL {
    throw new OidcFlowError("oidc_disabled", "OIDC provider is disabled.");
  }

  async verifyCallback(): Promise<OidcVerifiedIdentity> {
    throw new OidcFlowError("oidc_disabled", "OIDC provider is disabled.");
  }
}

function hasExactly(url: URL, name: string, expected: string) {
  const values = url.searchParams.getAll(name);
  return values.length === 1 && values[0] === expected;
}

function isExplicitLocalHttp(url: URL, allowed: boolean | undefined) {
  return Boolean(
    allowed &&
      url.protocol === "http:" &&
      (url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]"),
  );
}

function assertCallbackUrl(
  value: string,
  expectedCallbackAuthority: string | undefined,
  allowLocalTestCallback: boolean | undefined,
) {
  if (value === (expectedCallbackAuthority ?? PANEL_OIDC_CALLBACK_URL)) {
    try {
      const url = new URL(value);
      if (
        url.protocol === "https:" && !url.username && !url.password && !url.port &&
        url.pathname === "/auth/callback" && !url.search && !url.hash &&
        `${url.origin}${url.pathname}` === value
      ) return;
    } catch { /* Fall through. */ }
  }
  try {
    const url = new URL(value);
    if (
      allowLocalTestCallback &&
      isExplicitLocalHttp(url, true) &&
      url.pathname === "/auth/callback" &&
      !url.search &&
      !url.hash &&
      !url.username &&
      !url.password
    ) {
      return;
    }
  } catch {
    // Fall through to the controlled callback error.
  }
  throw new OidcFlowError("oidc_invalid_callback", "OIDC callback URL is invalid.");
}

function assertAuthorizationUrl(input: {
  url: URL;
  request: OidcAuthorizationRequest;
  expectedOrigin: string;
  allowInsecureLocalAuthorization?: boolean;
}) {
  const { url, request } = input;
  let expectedOrigin: string;
  try {
    expectedOrigin = new URL(input.expectedOrigin).origin;
  } catch {
    throw new OidcFlowError("oidc_provider_rejected", "OIDC authorization origin is invalid.");
  }

  if (url.protocol !== "https:" && !isExplicitLocalHttp(url, input.allowInsecureLocalAuthorization)) {
    throw new OidcFlowError("oidc_provider_rejected", "OIDC authorization URL must use HTTPS.");
  }
  if (url.origin !== expectedOrigin || url.username || url.password || url.hash) {
    throw new OidcFlowError("oidc_provider_rejected", "OIDC authorization URL authority is invalid.");
  }
  for (const [name, expected] of [
    ["state", request.state],
    ["nonce", request.nonce],
    ["code_challenge", request.codeChallenge],
    ["code_challenge_method", request.codeChallengeMethod],
    ["redirect_uri", request.redirectUri],
  ] as const) {
    if (!hasExactly(url, name, expected)) {
      throw new OidcFlowError("oidc_provider_rejected", `OIDC authorization URL has invalid ${name}.`);
    }
  }
  if (
    !hasExactly(url, "response_type", "code") ||
    !hasExactly(url, "response_mode", "query") ||
    (request.prompt === "login" ? !hasExactly(url, "prompt", "login") : url.searchParams.has("prompt")) ||
    url.searchParams.has("code_verifier")
  ) {
    throw new OidcFlowError("oidc_provider_rejected", "OIDC authorization response type is invalid.");
  }
}

export async function beginOidcAuthorization(input: BeginOidcAuthorizationInput) {
  assertCallbackUrl(input.redirectUri, input.expectedCallbackAuthority, input.allowLocalTestCallback);
  const now = input.now?.() ?? new Date();
  const panelLoginBinding = input.panelLoginBinding === undefined
    ? undefined
    : exactPanelLoginBinding(input.panelLoginBinding);
  const panelLoginDestinationHostname = input.panelLoginDestinationHostname === undefined
    ? undefined
    : exactPanelLoginDestinationHostname(input.panelLoginDestinationHostname);
  if (
    (panelLoginBinding !== undefined) !== (input.returnTo === "/login") ||
    (panelLoginBinding !== undefined) !== (panelLoginDestinationHostname !== undefined)
  ) {
    throw new OidcFlowError("oidc_invalid_callback", "OIDC panel login binding is invalid.");
  }
  const state = randomOpaqueValue(32, panelLoginBinding ? "plogin_" : "");
  const nonce = randomOpaqueValue(32);
  const codeVerifier = randomOpaqueValue(64);
  const codeChallenge = await createS256Challenge(codeVerifier);
  const returnTo = sanitizeOidcReturnTo(input.returnTo, input.returnOrigin);
  const transaction: OidcAuthorizationTransaction = {
    state,
    nonce,
    codeVerifier,
    redirectUri: input.redirectUri,
    returnTo,
    expectedIssuer: input.expectedIssuer,
    expectedAudience: input.expectedAudience,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + OIDC_TRANSACTION_LIFETIME_MS).toISOString(),
    ...(panelLoginBinding ? { panelLoginBinding } : {}),
    ...(panelLoginDestinationHostname ? { panelLoginDestinationHostname } : {}),
  };

  await input.transactionStore.save(transaction);
  const authorizationRequest: OidcAuthorizationRequest = {
    state,
    nonce,
    codeChallenge,
    codeChallengeMethod: "S256",
    redirectUri: input.redirectUri,
    ...(panelLoginBinding ? { prompt: "login" as const } : {}),
  };
  let authorizationUrl: URL;
  try {
    authorizationUrl = await input.provider.buildAuthorizationUrl(authorizationRequest);
    assertAuthorizationUrl({
      url: authorizationUrl,
      request: authorizationRequest,
      expectedOrigin: input.expectedAuthorizationOrigin ?? input.expectedIssuer,
      allowInsecureLocalAuthorization: input.allowInsecureLocalAuthorization,
    });
  } catch (error) {
    await input.transactionStore.discard(state).catch(() => undefined);
    if (error instanceof OidcFlowError) throw error;
    throw new OidcFlowError("oidc_provider_unavailable", "OIDC provider is unavailable.");
  }

  return {
    authorizationUrl: authorizationUrl.toString(),
    state,
    returnTo,
    expiresAt: transaction.expiresAt,
  };
}

function assertVerifiedIdentity(
  identity: OidcVerifiedIdentity,
  transaction: OidcAuthorizationTransaction,
) {
  if (!identity || typeof identity !== "object") {
    throw new OidcFlowError("oidc_provider_rejected", "OIDC identity is invalid.");
  }
  if (typeof identity.nonce !== "string" || identity.nonce !== transaction.nonce) {
    throw new OidcFlowError("oidc_nonce_mismatch", "OIDC nonce validation failed.");
  }
  if (typeof identity.issuer !== "string" || identity.issuer !== transaction.expectedIssuer) {
    throw new OidcFlowError("oidc_issuer_mismatch", "OIDC issuer validation failed.");
  }
  if (!Array.isArray(identity.audience) || !identity.audience.every((value) => typeof value === "string") || !identity.audience.includes(transaction.expectedAudience)) {
    throw new OidcFlowError("oidc_audience_mismatch", "OIDC audience validation failed.");
  }
  if (typeof identity.subject !== "string" || !identity.subject.trim() || identity.subject.length > 512) {
    throw new OidcFlowError("oidc_provider_rejected", "OIDC subject is missing.");
  }
  if (
    identity.emailVerified !== true || typeof identity.email !== "string" ||
    identity.email !== identity.email.trim() || identity.email.length > 320 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identity.email)
  ) throw new OidcFlowError("oidc_provider_rejected", "OIDC verified email is invalid.");
  if (
    identity.displayName !== undefined &&
    (typeof identity.displayName !== "string" || identity.displayName !== identity.displayName.trim() || identity.displayName.length > 256)
  ) throw new OidcFlowError("oidc_provider_rejected", "OIDC display name is invalid.");
}

function exactResponseIssuer(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (
    typeof value !== "string" || !value || value.length > 2_048 || value !== value.trim() ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) throw new OidcFlowError("oidc_invalid_callback", "OIDC response issuer is invalid.");
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" || url.username || url.password || url.search || url.hash ||
      url.toString().replace(/\/$/, "") !== value
    ) throw new Error("invalid");
  } catch {
    throw new OidcFlowError("oidc_invalid_callback", "OIDC response issuer is invalid.");
  }
  return value;
}

function assertResponseIssuer(
  responseIssuer: string | undefined,
  transaction: OidcAuthorizationTransaction,
): void {
  if (responseIssuer !== undefined && responseIssuer !== transaction.expectedIssuer) {
    throw new OidcFlowError("oidc_issuer_mismatch", "OIDC response issuer validation failed.");
  }
}

export async function rejectOidcProviderCallback(input: RejectOidcProviderCallbackInput): Promise<void> {
  const now = input.now?.() ?? new Date();
  const state = input.state.trim();
  if (!state) throw new OidcFlowError("oidc_invalid_callback", "OIDC callback state is required.");
  const responseIssuer = exactResponseIssuer(input.responseIssuer);
  const transaction = await input.transactionStore.consume(state, now);
  assertResponseIssuer(responseIssuer, transaction);
}

export async function completeOidcCallback(input: CompleteOidcCallbackInput) {
  const now = input.now?.() ?? new Date();
  const state = input.callback.state.trim();
  const code = input.callback.code.trim();
  if (!state || !code) {
    throw new OidcFlowError("oidc_invalid_callback", "OIDC callback state and code are required.");
  }
  const responseIssuer = exactResponseIssuer(input.callback.responseIssuer);
  const transaction = await input.transactionStore.consume(state, now);
  if (transaction.panelLoginBinding) {
    const proof = exactPanelLoginBinding(input.panelLoginBinding);
    if (
      proof.keyId !== transaction.panelLoginBinding.keyId ||
      proof.digest !== transaction.panelLoginBinding.digest || transaction.returnTo !== "/login" ||
      !transaction.panelLoginDestinationHostname ||
      exactPanelLoginDestinationHostname(transaction.panelLoginDestinationHostname) !== transaction.panelLoginDestinationHostname
    ) throw new OidcFlowError("oidc_invalid_callback", "OIDC panel login binding is invalid.");
  } else if (input.panelLoginBinding !== undefined) {
    throw new OidcFlowError("oidc_invalid_callback", "OIDC panel login binding is invalid.");
  }
  assertResponseIssuer(responseIssuer, transaction);
  let identity: OidcVerifiedIdentity;

  try {
    identity = await input.provider.verifyCallback({
      code,
      state,
      ...(responseIssuer ? { responseIssuer } : {}),
      codeVerifier: transaction.codeVerifier,
      redirectUri: transaction.redirectUri,
      expectedNonce: transaction.nonce,
      expectedIssuer: transaction.expectedIssuer,
      expectedAudience: transaction.expectedAudience,
    });
  } catch (error) {
    if (error instanceof OidcFlowError) throw error;
    throw new OidcFlowError("oidc_provider_unavailable", "OIDC provider is unavailable.");
  }

  assertVerifiedIdentity(identity, transaction);

  return {
    identity,
    returnTo: transaction.returnTo,
    ...(transaction.panelLoginDestinationHostname ? { panelLoginDestinationHostname: transaction.panelLoginDestinationHostname } : {}),
  };
}
