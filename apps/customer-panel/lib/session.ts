import type { SaaSContractError, StoreMembership } from "@celebix/saas-contracts";

const PANEL_SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;
const PANEL_SESSION_MAX_AGE_MS = PANEL_SESSION_MAX_AGE_SECONDS * 1000;
const PANEL_SESSION_CLOCK_SKEW_MS = 30_000;
const PANEL_SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;
const AUTHORITY_ID_PATTERN = /^[A-Za-z0-9._:@/-]{1,512}$/;
const STORE_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

export const PANEL_SESSION_COOKIE_NAME = "__Host-celebix_panel";
export const PANEL_LOCAL_TEST_SESSION_COOKIE_NAME = "celebix_panel_local";

export type PanelSessionCookiePolicy =
  | { kind: "production" }
  | { kind: "local-http-test" };

export interface PanelSession {
  id: string;
  principal: {
    id: string;
    issuer: string;
    subject: string;
  };
  activeStoreId?: string;
  createdAt: string;
  rotatedAt: string;
  expiresAt: string;
}

export interface PanelSessionStore {
  create(session: PanelSession): Promise<void>;
  read(sessionId: string): Promise<PanelSession | null>;
  rotate(previousSessionId: string, session: PanelSession): Promise<void>;
  destroy(sessionId: string): Promise<void>;
}

export interface ActiveStoreSelection {
  storeId: string;
  membership: StoreMembership & { status: "active" };
}

export function getPanelSessionCookieName(policy: PanelSessionCookiePolicy) {
  return policy.kind === "production" ? PANEL_SESSION_COOKIE_NAME : PANEL_LOCAL_TEST_SESSION_COOKIE_NAME;
}

export function getPanelSessionCookieOptions(policy: PanelSessionCookiePolicy) {
  return {
    httpOnly: true as const,
    secure: policy.kind === "production",
    sameSite: "lax" as const,
    path: "/" as const,
    maxAge: PANEL_SESSION_MAX_AGE_SECONDS,
  };
}

function serializePanelSessionCookie(
  value: string,
  policy: PanelSessionCookiePolicy,
  maxAge: number,
) {
  const secure = policy.kind === "production" ? "; Secure" : "";
  return `${getPanelSessionCookieName(policy)}=${value}; HttpOnly${secure}; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}

export function buildPanelSessionSetCookie(sessionId: string, policy: PanelSessionCookiePolicy) {
  if (!PANEL_SESSION_ID_PATTERN.test(sessionId)) throw new Error("panel_session_id_invalid");
  return serializePanelSessionCookie(sessionId, policy, PANEL_SESSION_MAX_AGE_SECONDS);
}

export function buildPanelSessionClearCookie(policy: PanelSessionCookiePolicy) {
  return serializePanelSessionCookie("", policy, 0);
}

function cloneSession(session: PanelSession) {
  return structuredClone(session);
}

export class InMemoryPanelSessionStore implements PanelSessionStore {
  private readonly sessions = new Map<string, PanelSession>();

  async create(session: PanelSession) {
    if (this.sessions.has(session.id)) throw new Error("panel_session_conflict");
    this.sessions.set(session.id, cloneSession(session));
  }

  async read(sessionId: string) {
    const session = this.sessions.get(sessionId);
    return session ? cloneSession(session) : null;
  }

  async rotate(previousSessionId: string, session: PanelSession) {
    if (!this.sessions.has(previousSessionId)) throw new Error("panel_session_missing");
    if (session.id !== previousSessionId && this.sessions.has(session.id)) {
      throw new Error("panel_session_conflict");
    }
    this.sessions.delete(previousSessionId);
    this.sessions.set(session.id, cloneSession(session));
  }

  async destroy(sessionId: string) {
    this.sessions.delete(sessionId);
  }
}

/** Production placeholder. A persistent server adapter is required before activation. */
export class DisabledPanelSessionStore implements PanelSessionStore {
  async create() {
    throw new Error("panel_session_store_disabled");
  }

  async read() {
    return null;
  }

  async rotate() {
    throw new Error("panel_session_store_disabled");
  }

  async destroy() {
    // A disabled store has no session state to revoke.
  }
}

export function toSafePanelSession(value: unknown): PanelSession {
  const candidate = value as Partial<PanelSession>;
  return {
    id: String(candidate.id ?? ""),
    principal: {
      id: String(candidate.principal?.id ?? ""),
      issuer: String(candidate.principal?.issuer ?? ""),
      subject: String(candidate.principal?.subject ?? ""),
    },
    ...(candidate.activeStoreId ? { activeStoreId: String(candidate.activeStoreId) } : {}),
    createdAt: String(candidate.createdAt ?? ""),
    rotatedAt: String(candidate.rotatedAt ?? ""),
    expiresAt: String(candidate.expiresAt ?? ""),
  };
}

function canonicalTimestamp(value: string) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value ? timestamp : null;
}

function isNormalizedAuthority(value: string) {
  return value === value.trim() && AUTHORITY_ID_PATTERN.test(value);
}

function isValidSession(session: PanelSession, now: Date) {
  const createdAt = canonicalTimestamp(session.createdAt);
  const rotatedAt = canonicalTimestamp(session.rotatedAt);
  const expiresAt = canonicalTimestamp(session.expiresAt);
  if (createdAt === null || rotatedAt === null || expiresAt === null) return false;
  if (!PANEL_SESSION_ID_PATTERN.test(session.id)) return false;
  if (
    !isNormalizedAuthority(session.principal.id) ||
    !isNormalizedAuthority(session.principal.issuer) ||
    !isNormalizedAuthority(session.principal.subject)
  ) return false;
  if (session.activeStoreId !== undefined && !STORE_ID_PATTERN.test(session.activeStoreId)) return false;
  return (
    createdAt <= now.getTime() &&
    rotatedAt >= createdAt &&
    rotatedAt <= now.getTime() + PANEL_SESSION_CLOCK_SKEW_MS &&
    rotatedAt < expiresAt &&
    expiresAt > now.getTime() &&
    expiresAt > createdAt &&
    expiresAt <= createdAt + PANEL_SESSION_MAX_AGE_MS
  );
}

export async function resolvePanelSession(
  sessionId: string | null,
  store: PanelSessionStore,
  now = new Date(),
) {
  if (!sessionId) return null;
  const stored = await store.read(sessionId);
  if (!stored) {
    if (!PANEL_SESSION_ID_PATTERN.test(sessionId)) await store.destroy(sessionId).catch(() => undefined);
    return null;
  }
  const safe = toSafePanelSession(stored);
  if (isValidSession(safe, now)) return safe;
  await store.destroy(sessionId).catch(() => undefined);
  return null;
}

export async function resolvePanelPageAccess(
  sessionId: string | null,
  store: PanelSessionStore,
  now = new Date(),
) {
  const session = await resolvePanelSession(sessionId, store, now);
  if (!session) {
    return { allowed: false as const, redirectTo: "/login" as const, code: "unauthenticated" as const };
  }
  return { allowed: true as const, session };
}

function membershipDenied(): { ok: false; error: SaaSContractError } {
  return {
    ok: false,
    error: { schemaVersion: 1, code: "membership_denied", retryable: false },
  };
}

export function selectActiveStore(
  session: PanelSession,
  memberships: readonly StoreMembership[],
  selectionHint?: string,
): { ok: true; selection: ActiveStoreSelection } | { ok: false; error: SaaSContractError } {
  const selectedStoreId = selectionHint ?? session.activeStoreId;
  const activeMemberships = memberships.filter(
    (membership) => membership.principalId === session.principal.id && membership.status === "active",
  ) as Array<StoreMembership & { status: "active" }>;

  if (!selectedStoreId) {
    if (activeMemberships.length !== 1) return membershipDenied();
    return {
      ok: true,
      selection: { storeId: activeMemberships[0].storeId, membership: activeMemberships[0] },
    };
  }

  const membership = activeMemberships.find((candidate) => candidate.storeId === selectedStoreId);
  if (!membership) return membershipDenied();
  return { ok: true, selection: { storeId: membership.storeId, membership } };
}

function createOpaqueSessionId() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString("base64url");
}

export function createPanelSession(input: {
  principal: PanelSession["principal"];
  activeStoreId?: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  return toSafePanelSession({
    id: createOpaqueSessionId(),
    principal: input.principal,
    ...(input.activeStoreId ? { activeStoreId: input.activeStoreId } : {}),
    createdAt: now.toISOString(),
    rotatedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + PANEL_SESSION_MAX_AGE_MS).toISOString(),
  });
}

export async function rotatePanelSessionForStore(input: {
  store: PanelSessionStore;
  session: PanelSession;
  memberships: readonly StoreMembership[];
  selectionHint: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const selection = selectActiveStore(input.session, input.memberships, input.selectionHint);
  if (!selection.ok) return selection;
  if (!isValidSession(input.session, now)) {
    return { ok: false as const, error: { schemaVersion: 1, code: "unauthenticated", retryable: false } as SaaSContractError };
  }

  const absoluteExpiry = Date.parse(input.session.createdAt) + PANEL_SESSION_MAX_AGE_MS;
  const next: PanelSession = {
    ...toSafePanelSession(input.session),
    id: createOpaqueSessionId(),
    activeStoreId: selection.selection.storeId,
    rotatedAt: now.toISOString(),
    expiresAt: new Date(Math.min(absoluteExpiry, now.getTime() + PANEL_SESSION_MAX_AGE_MS)).toISOString(),
  };
  await input.store.rotate(input.session.id, next);
  return { ok: true as const, session: next, selection: selection.selection };
}
