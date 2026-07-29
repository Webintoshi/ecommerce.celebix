import "server-only";

import type { PostgresPanelSessionRepository } from "../panel-session-persistence/postgres-panel-session-repository.ts";
import { serializePersistentPanelSessionCookie } from "../panel-session-completion/cookie.ts";

export type PanelSessionRotationAuthority = Pick<
  PostgresPanelSessionRepository,
  "rotateSession" | "recoverOperation"
>;

export type PanelSessionRevocationAuthority = Pick<
  PostgresPanelSessionRepository,
  "revokeSession"
>;

export type PanelSessionRotationResult = Readonly<
  | { kind: "rotated"; activeStoreId: string; replacementCookie: string }
  | { kind: "unauthenticated" | "membership_denied" | "operation_mismatch" | "durable_authority_invalid" | "unavailable" }
>;

export type PanelSessionRevocationResult = Readonly<
  | { kind: "revoked" | "unauthenticated" | "durable_authority_invalid" | "unavailable" }
>;

function frozenKind<T extends PanelSessionRotationResult["kind"] | PanelSessionRevocationResult["kind"]>(kind: T) {
  return Object.freeze({ kind });
}

function safeRotationKind(kind: string): PanelSessionRotationResult {
  if (["unauthenticated", "membership_denied", "operation_mismatch", "durable_authority_invalid", "unavailable"].includes(kind)) {
    return frozenKind(kind as Exclude<PanelSessionRotationResult["kind"], "rotated">);
  }
  return frozenKind("durable_authority_invalid");
}

function projectRotation(
  credential: unknown,
  session: unknown,
  requestedStoreId: string,
  now: Date,
): PanelSessionRotationResult {
  if (
    typeof credential !== "string" || !session || typeof session !== "object" || Array.isArray(session) ||
    (session as { activeStoreId?: unknown }).activeStoreId !== requestedStoreId
  ) return frozenKind("durable_authority_invalid");
  const persisted = session as { issuedAt?: unknown; expiresAt?: unknown };
  if (typeof persisted.issuedAt !== "string" || typeof persisted.expiresAt !== "string") {
    return frozenKind("durable_authority_invalid");
  }
  try {
    return Object.freeze({
      kind: "rotated" as const,
      activeStoreId: requestedStoreId,
      replacementCookie: serializePersistentPanelSessionCookie({
        credential,
        issuedAt: persisted.issuedAt,
        expiresAt: persisted.expiresAt,
        now,
      }),
    });
  } catch { return frozenKind("durable_authority_invalid"); }
}

export async function rotatePersistentPanelSessionCredential(input: {
  authority: PanelSessionRotationAuthority;
  currentCredential: string;
  operationId: string;
  requestedStoreId: string;
  now: Date;
}): Promise<PanelSessionRotationResult> {
  let result;
  try {
    result = await input.authority.rotateSession({
      currentCredential: input.currentCredential,
      operationId: input.operationId,
      requestedStoreId: input.requestedStoreId,
      now: input.now,
    });
  } catch { return frozenKind("unavailable"); }
  if (
    (result.kind === "rotated" || result.kind === "operation_replayed") &&
    "credential" in result && "session" in result
  ) return projectRotation(result.credential, result.session, input.requestedStoreId, input.now);
  if (result.kind !== "commit_unknown" || !("credential" in result)) return safeRotationKind(result.kind);

  let recovered;
  try {
    recovered = await input.authority.recoverOperation({
      operationId: input.operationId,
      operationKind: "rotate",
      credential: result.credential,
      currentCredential: input.currentCredential,
      requestedStoreId: input.requestedStoreId,
    });
  } catch { return frozenKind("unavailable"); }
  if (recovered.kind === "operation_replayed" && "session" in recovered) {
    return projectRotation(result.credential, recovered.session, input.requestedStoreId, input.now);
  }
  return safeRotationKind(recovered.kind);
}

export async function revokePersistentPanelSessionCredential(input: {
  authority: PanelSessionRevocationAuthority;
  credential: string;
  now: Date;
}): Promise<PanelSessionRevocationResult> {
  let result;
  try {
    result = await input.authority.revokeSession({
      credential: input.credential,
      reason: "logout",
      now: input.now,
    });
  } catch { return frozenKind("unavailable"); }
  if (result.kind === "revoked" || result.kind === "unauthenticated" || result.kind === "durable_authority_invalid") {
    return frozenKind(result.kind);
  }
  return frozenKind("unavailable");
}
