import type { SaaSContractError, StoreMembership } from "@celebix/saas-contracts";

const PANEL_SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;
const PANEL_SESSION_MAX_AGE_MS = PANEL_SESSION_MAX_AGE_SECONDS * 1000;

export const PANEL_SESSION_COOKIE_NAME = "__Host-celebix_panel";

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

export function getPanelSessionCookieOptions(nodeEnv = process.env.NODE_ENV) {
  return {
    httpOnly: true as const,
    secure: nodeEnv === "production",
    sameSite: "lax" as const,
    path: "/" as const,
    maxAge: PANEL_SESSION_MAX_AGE_SECONDS,
  };
}

function cloneSession(session: PanelSession) {
  return structuredClone(session);
}

export class InMemoryPanelSessionStore implements PanelSessionStore {
  private readonly sessions = new Map<string, PanelSession>();

  async create(session: PanelSession) {
    this.sessions.set(session.id, cloneSession(session));
  }

  async read(sessionId: string) {
    const session = this.sessions.get(sessionId);
    return session ? cloneSession(session) : null;
  }

  async rotate(previousSessionId: string, session: PanelSession) {
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

function isValidSession(session: PanelSession, now: Date) {
  return (
    session.id.length >= 16 &&
    Boolean(session.principal.id && session.principal.issuer && session.principal.subject) &&
    Number.isFinite(Date.parse(session.createdAt)) &&
    Number.isFinite(Date.parse(session.expiresAt)) &&
    Date.parse(session.expiresAt) > now.getTime() &&
    Date.parse(session.expiresAt) - Date.parse(session.createdAt) <= PANEL_SESSION_MAX_AGE_MS
  );
}

export async function resolvePanelSession(
  sessionId: string | null,
  store: PanelSessionStore,
  now = new Date(),
) {
  if (!sessionId || sessionId.length < 16) return null;
  const stored = await store.read(sessionId);
  if (!stored) return null;
  const safe = toSafePanelSession(stored);
  return isValidSession(safe, now) ? safe : null;
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
