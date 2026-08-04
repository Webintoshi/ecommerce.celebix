import type {
  StorefrontAccountAddress,
  StorefrontAccountDevice,
  StorefrontAccountMutationResult,
  StorefrontAccountOrder,
  StorefrontAccountSnapshot,
  StorefrontAuthStartResult,
  StorefrontAuthVerifyResult,
} from "@celebix/saas-contracts";

import type { PostgresPoolLike, PostgresTimeoutOptions } from "../postgres/pool.ts";
import type { StorefrontCredentialCandidate } from "../storefront-commerce/types.ts";

type Authority = Readonly<{ hostname: string; now: Date }>;
type AuthenticatedAuthority = Authority & Readonly<{ candidates: readonly StorefrontCredentialCandidate[] }>;
type OperationAuthority = AuthenticatedAuthority & Readonly<{ operationId: string; fingerprint: string; correlationId: string }>;

export type StorefrontIdentitySessionResult = Readonly<
  | { outcome: "unauthenticated" }
  | { outcome: "profile_required" }
  | { outcome: "found"; snapshot: StorefrontAccountSnapshot }
>;

export interface StorefrontIdentityRepository {
  start(input: Authority & Readonly<{
    challengeId: string;
    emailDigest: string;
    requestDigest: string;
    codeKeyId: string;
    codeDigest: string;
    expiresAt: Date;
    outboxId: string;
    recipientCiphertext: string;
    brandSnapshot: Readonly<Record<string, unknown>>;
    correlationId: string;
  }>): Promise<StorefrontAuthStartResult>;
  verify(input: Authority & Readonly<{
    challengeId: string;
    emailDigest: string;
    codeDigest: string;
    email: string;
    accountId: string;
    sessionId: string;
    sessionKeyId: string;
    sessionDigest: string;
    csrfDigest: string;
    deviceLabel: string;
    userAgentDigest: string;
    correlationId: string;
  }>): Promise<StorefrontAuthVerifyResult>;
  completeProfile(input: OperationAuthority & Readonly<{
    customerId: string;
    firstName: string;
    lastName: string;
    phone?: string;
    fullSessionId: string;
    sessionKeyId: string;
    sessionDigest: string;
    csrfDigest: string;
    deviceLabel: string;
    userAgentDigest: string;
  }>): Promise<StorefrontAccountMutationResult>;
  session(input: AuthenticatedAuthority): Promise<StorefrontIdentitySessionResult>;
  logout(input: AuthenticatedAuthority & Readonly<{ correlationId: string }>): Promise<void>;
  logoutAll(input: AuthenticatedAuthority & Readonly<{ correlationId: string }>): Promise<number>;
  updateProfile(input: OperationAuthority & Readonly<{ firstName: string; lastName: string; phone?: string; expectedVersion: number }>): Promise<StorefrontAccountMutationResult>;
  saveAddress(input: OperationAuthority & Readonly<{ address: StorefrontAccountAddress; expectedVersion: number }>): Promise<StorefrontAccountMutationResult>;
  deleteAddress(input: OperationAuthority & Readonly<{ addressId: string; expectedVersion: number }>): Promise<StorefrontAccountMutationResult>;
  favorite(input: OperationAuthority & Readonly<{ productId: string; enabled: boolean }>): Promise<StorefrontAccountMutationResult>;
  orders(input: AuthenticatedAuthority & Readonly<{ limit: number }>): Promise<readonly StorefrontAccountOrder[]>;
  order(input: AuthenticatedAuthority & Readonly<{ orderReference: string }>): Promise<StorefrontAccountOrder>;
  devices(input: AuthenticatedAuthority): Promise<readonly StorefrontAccountDevice[]>;
  revokeDevice(input: OperationAuthority & Readonly<{ deviceId: string }>): Promise<StorefrontAccountMutationResult>;
}

export type StorefrontIdentityAuditEvent = Readonly<{ type: "storefront_identity_commit_unknown" }>;

export type PostgresStorefrontIdentityRepositoryOptions = Readonly<{
  pool: PostgresPoolLike;
  role: "celebix_saas_host_resolver";
  timeouts: PostgresTimeoutOptions;
  audit: (event: StorefrontIdentityAuditEvent) => void | Promise<void>;
}>;
