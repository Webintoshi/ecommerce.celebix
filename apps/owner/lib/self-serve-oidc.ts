const OIDC_TRANSACTION_LIFETIME_MS = 10 * 60_000;
const APPROVED_RETURN_PATHS = new Set(["/kayit"]);

export type OidcFlowErrorCode =
  | "oidc_disabled"
  | "oidc_invalid_state"
  | "oidc_state_replayed"
  | "oidc_state_expired"
  | "oidc_nonce_mismatch"
  | "oidc_issuer_mismatch"
  | "oidc_audience_mismatch"
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
}

export interface OidcCallbackInput {
  code: string;
  state: string;
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
}

export interface OidcTransactionStore {
  save(transaction: OidcAuthorizationTransaction): Promise<void>;
  consume(state: string, now: Date): Promise<OidcAuthorizationTransaction>;
}

export interface BeginOidcAuthorizationInput {
  provider: OidcProviderPort;
  transactionStore: OidcTransactionStore;
  redirectUri: string;
  returnTo: string;
  expectedIssuer: string;
  expectedAudience: string;
  now?: () => Date;
}

export interface CompleteOidcCallbackInput {
  provider: OidcProviderPort;
  transactionStore: OidcTransactionStore;
  callback: OidcCallbackInput;
  now?: () => Date;
}

function randomOpaqueValue(byteLength: number) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString("base64url");
}

async function createS256Challenge(verifier: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return Buffer.from(digest).toString("base64url");
}

export function sanitizeOidcReturnTo(value: string) {
  try {
    const parsed = new URL(value, "https://ecommerce.celebix.co");
    if (parsed.origin !== "https://ecommerce.celebix.co" || !APPROVED_RETURN_PATHS.has(parsed.pathname)) {
      return "/kayit";
    }
    return `${parsed.pathname}${parsed.search}`;
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
}

/** Production placeholder: server persistence must be wired before activation. */
export class DisabledOidcTransactionStore implements OidcTransactionStore {
  async save() {
    throw new OidcFlowError("oidc_disabled", "OIDC transaction persistence is disabled.");
  }

  async consume(): Promise<OidcAuthorizationTransaction> {
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

export async function beginOidcAuthorization(input: BeginOidcAuthorizationInput) {
  const now = input.now?.() ?? new Date();
  const state = randomOpaqueValue(32);
  const nonce = randomOpaqueValue(32);
  const codeVerifier = randomOpaqueValue(64);
  const codeChallenge = await createS256Challenge(codeVerifier);
  const returnTo = sanitizeOidcReturnTo(input.returnTo);
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
  };

  await input.transactionStore.save(transaction);
  const authorizationRequest: OidcAuthorizationRequest = {
    state,
    nonce,
    codeChallenge,
    codeChallengeMethod: "S256",
    redirectUri: input.redirectUri,
  };
  const authorizationUrl = await input.provider.buildAuthorizationUrl(authorizationRequest);

  if (authorizationUrl.searchParams.has("code_verifier")) {
    throw new OidcFlowError("oidc_provider_rejected", "OIDC provider exposed private PKCE material.");
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
  if (identity.nonce !== transaction.nonce) {
    throw new OidcFlowError("oidc_nonce_mismatch", "OIDC nonce validation failed.");
  }
  if (identity.issuer !== transaction.expectedIssuer) {
    throw new OidcFlowError("oidc_issuer_mismatch", "OIDC issuer validation failed.");
  }
  if (!identity.audience.includes(transaction.expectedAudience)) {
    throw new OidcFlowError("oidc_audience_mismatch", "OIDC audience validation failed.");
  }
  if (!identity.subject.trim()) {
    throw new OidcFlowError("oidc_provider_rejected", "OIDC subject is missing.");
  }
}

export async function completeOidcCallback(input: CompleteOidcCallbackInput) {
  const now = input.now?.() ?? new Date();
  const transaction = await input.transactionStore.consume(input.callback.state, now);
  let identity: OidcVerifiedIdentity;

  try {
    identity = await input.provider.verifyCallback({
      code: input.callback.code,
      state: input.callback.state,
      codeVerifier: transaction.codeVerifier,
      redirectUri: transaction.redirectUri,
      expectedNonce: transaction.nonce,
      expectedIssuer: transaction.expectedIssuer,
      expectedAudience: transaction.expectedAudience,
    });
  } catch (error) {
    if (error instanceof OidcFlowError) throw error;
    throw new OidcFlowError("oidc_provider_rejected", "OIDC provider rejected the callback.");
  }

  assertVerifiedIdentity(identity, transaction);

  return {
    identity,
    returnTo: transaction.returnTo,
  };
}
