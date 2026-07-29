import type { CreateStarterTenantInput } from "@celebix/saas-contracts";

import type { ValidatedRegistrationDetails } from "../self-serve-identity.ts";
import { buildCreateStarterTenantInput } from "../self-serve-identity.ts";
import {
  IdentityPersistenceError,
  exactObject,
  requiredString,
} from "./postgres-identity-common.ts";

export interface VerifiedIdentitySnapshot {
  issuer: string;
  subject: string;
  email: string;
  emailVerified: true;
  displayName?: string;
}

export interface RegistrationTenantSeed {
  details: ValidatedRegistrationDetails;
  idempotencyKey: string;
  requestedAt: string;
}

export interface VerifiedTenantAuthority {
  input: CreateStarterTenantInput;
  canonicalFingerprint: string;
}

export function parseVerifiedIdentitySnapshot(value: unknown): VerifiedIdentitySnapshot {
  const row = exactObject(value, ["issuer", "subject", "email", "emailVerified"], ["displayName"]);
  if (row.emailVerified !== true) throw new IdentityPersistenceError();
  const issuer = requiredString(row.issuer, 2_048);
  const subject = requiredString(row.subject, 512);
  const email = requiredString(row.email, 320).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new IdentityPersistenceError();
  const parsed: VerifiedIdentitySnapshot = { issuer, subject, email, emailVerified: true };
  if (row.displayName !== undefined) parsed.displayName = requiredString(row.displayName, 160);
  return parsed;
}

export async function buildVerifiedTenantAuthority(
  identity: VerifiedIdentitySnapshot,
  seed: RegistrationTenantSeed,
): Promise<VerifiedTenantAuthority> {
  const result = await buildCreateStarterTenantInput(
    {
      issuer: identity.issuer,
      subject: identity.subject,
      email: identity.email,
      emailVerified: true,
      audience: [],
      nonce: "",
      ...(identity.displayName ? { displayName: identity.displayName } : {}),
    },
    seed.details,
    { idempotencyKey: seed.idempotencyKey, requestedAt: seed.requestedAt },
  );
  if (!result.ok || !/^[a-f0-9]{64}$/.test(result.canonicalFingerprint)) {
    throw new IdentityPersistenceError();
  }
  return { input: result.input, canonicalFingerprint: result.canonicalFingerprint };
}
