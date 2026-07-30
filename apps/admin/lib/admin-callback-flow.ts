import type { AdminLoginErrorCode } from "./admin-login-contract";

type AdminCallbackErrorCode = Exclude<
  AdminLoginErrorCode,
  "provider_disabled" | "invalid_callback" | "session_write_failed"
>;

export async function resolveAdminCallback<TTokens, TIdentity, TMembership>(input: {
  exchangeCode: () => Promise<TTokens>;
  fetchIdentity: (tokens: TTokens) => Promise<TIdentity>;
  readSubject: (identity: TIdentity) => string | null;
  findMembership: (subject: string) => Promise<TMembership | null>;
}): Promise<
  | {
      ok: true;
      tokens: TTokens;
      identity: TIdentity;
      membership: TMembership;
    }
  | { ok: false; error: AdminCallbackErrorCode }
> {
  let tokens: TTokens;
  try {
    tokens = await input.exchangeCode();
  } catch {
    return { ok: false, error: "token_exchange_failed" };
  }

  let identity: TIdentity;
  let subject: string | null;
  try {
    identity = await input.fetchIdentity(tokens);
    subject = input.readSubject(identity)?.trim() || null;
  } catch {
    return { ok: false, error: "identity_lookup_failed" };
  }

  if (!subject) {
    return { ok: false, error: "identity_lookup_failed" };
  }

  let membership: TMembership | null;
  try {
    membership = await input.findMembership(subject);
  } catch {
    return { ok: false, error: "membership_unavailable" };
  }

  if (!membership) {
    return { ok: false, error: "not_assigned" };
  }

  return { ok: true, tokens, identity, membership };
}
