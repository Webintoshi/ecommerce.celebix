import { createHash } from "node:crypto";

import type {
  StorefrontAccountAddress,
  StorefrontAccountMutationResult,
  StorefrontAccountOrder,
} from "@celebix/saas-contracts";
import type { StorefrontIdentityRepository, StorefrontIdentitySessionResult } from "@celebix/saas-data";

import {
  accountCredentialDigestCandidates,
  accountCsrfDigest,
  accountHostnameCodeDigest,
  accountHostnameEmailDigest,
  accountHostnameTicketDigest,
  accountRequestDigest,
  accountUserAgentDigest,
  createAccountSessionCredential,
  createStorefrontMagicTicket,
  openAccountChallenge,
  openAccountMagicTicket,
  readAccountCookie,
  sealAccountChallenge,
  serializeAccountChallengeCookie,
  serializeAccountChallengeCookieDeletion,
  serializeAccountMagicTicket,
  serializeAccountCookie,
  serializeAccountCookieDeletion,
  type StorefrontIdentityKeyring,
} from "./credential.ts";
import { normalizeStorefrontAccountEmail } from "./email.ts";

const CODE = /^[0-9]{6}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const CSRF_COOKIE = "__Host-celebix_account_csrf";

export type StorefrontIdentityRuntimeDependencies = Readonly<{
  repository: StorefrontIdentityRepository;
  hmacKeyring: StorefrontIdentityKeyring;
  sealKeyring: StorefrontIdentityKeyring;
  now: () => Date;
  randomBytes: (size: number) => Uint8Array;
  randomUuid: () => string;
  randomLoginCode: () => string;
  deliverLoginCode: (message: Readonly<{ email: string; ticket: string; code: string; storeName: string; storeOrigin: string; returnTo: string; idempotencyKey: string }>) => Promise<void>;
}>;

type CookieAuthority = Readonly<{ hostname: string; cookieHeader: string | null }>;
type OperationAuthority = CookieAuthority & Readonly<{ operationId: string }>;
type MutationResponse = Readonly<{ result: StorefrontAccountMutationResult }>;

export interface StorefrontIdentityRuntime {
  start(input: Readonly<{ hostname: string; email: string; requestAuthority: string; returnTo: string; brand: Readonly<{ storeName: string; logoUrl: string | null; primaryColor: string | null }> }>): Promise<Readonly<{ result: Readonly<{ outcome: "accepted"; retryAfterSeconds: number }>; setCookie: string }>>;
  verify(input: Readonly<{ hostname: string; deviceLabel: string; userAgent: string }> & Readonly<{ ticket: string } | { challengeCookie: string | null; code: string }>): Promise<Readonly<{ result: Readonly<{ outcome: "authenticated"; profileRequired: false } | { outcome: "profile_required"; profileRequired: true }>; setCookies: readonly string[] }>>;
  completeProfile(input: OperationAuthority & Readonly<{ firstName: string; lastName: string; phone?: string; deviceLabel: string; userAgent: string }>): Promise<Readonly<{ result: StorefrontAccountMutationResult; setCookies: readonly string[] }>>;
  session(hostname: string, cookieHeader: string | null): Promise<StorefrontIdentitySessionResult & Readonly<{ setCookie?: string }>>;
  logout(hostname: string, cookieHeader: string | null): Promise<Readonly<{ setCookies: readonly string[] }>>;
  logoutAll(input: CookieAuthority): Promise<Readonly<{ revoked: number; setCookies: readonly string[] }>>;
  updateProfile(input: OperationAuthority & Readonly<{ firstName: string; lastName: string; phone?: string; expectedVersion: number }>): Promise<MutationResponse>;
  saveAddress(input: OperationAuthority & Readonly<{ address: StorefrontAccountAddress; expectedVersion: number }>): Promise<MutationResponse>;
  deleteAddress(input: OperationAuthority & Readonly<{ addressId: string; expectedVersion: number }>): Promise<MutationResponse>;
  favorite(input: OperationAuthority & Readonly<{ productId: string; enabled: boolean }>): Promise<MutationResponse>;
  orders(input: CookieAuthority & Readonly<{ limit: number }>): Promise<readonly StorefrontAccountOrder[]>;
  order(input: CookieAuthority & Readonly<{ orderReference: string }>): Promise<StorefrontAccountOrder>;
  devices(input: CookieAuthority): ReturnType<StorefrontIdentityRepository["devices"]>;
  revokeDevice(input: OperationAuthority & Readonly<{ deviceId: string }>): Promise<MutationResponse>;
}

function invalid(): never { throw new TypeError("storefront_identity_runtime_invalid"); }
function nowValue(source: () => Date): Date { const value = source(); if (!(value instanceof Date) || !Number.isFinite(value.getTime())) invalid(); return new Date(value.getTime()); }
function uuid(source: () => string): string { const value = source(); if (!UUID.test(value)) invalid(); return value; }
function correlation(kind: string, id: string): string { return `${kind}_${id.replaceAll("-", "")}`.slice(0, 80); }
function fingerprint(kind: string, value: unknown): string { return createHash("sha256").update(JSON.stringify([`storefront-identity/${kind}/v1`, value]), "utf8").digest("hex"); }
function csrfValue(random: (size: number) => Uint8Array): string {
  const selected = random(32); if (!(selected instanceof Uint8Array) || selected.byteLength !== 32) invalid();
  const bytes = Buffer.from(selected); try { return bytes.toString("base64url"); } finally { bytes.fill(0); }
}
function serializeCsrf(value: string): string { if (!/^[A-Za-z0-9_-]{43}$/u.test(value)) invalid(); return `${CSRF_COOKIE}=${value}; Path=/; Max-Age=2592000; Secure; SameSite=Strict`; }
function deleteCsrf(): string { return `${CSRF_COOKIE}=; Path=/; Max-Age=0; Secure; SameSite=Strict`; }
function challengeValue(value: string | null): string | null {
  if (!value) return null;
  if (value.startsWith("ch1.")) return value;
  for (const segment of value.split(";")) {
    const selected = segment.trim();
    if (selected.startsWith("__Host-celebix_account_challenge=")) return selected.slice("__Host-celebix_account_challenge=".length);
  }
  return null;
}

export function createStorefrontIdentityRuntime(dependencies: StorefrontIdentityRuntimeDependencies): StorefrontIdentityRuntime {
  const { repository, hmacKeyring, sealKeyring, now, randomBytes, randomUuid, randomLoginCode, deliverLoginCode } = dependencies;
  if (!repository || typeof repository.start !== "function" || typeof deliverLoginCode !== "function") invalid();

  function credentials(cookieHeader: string | null) {
    const cookie = readAccountCookie(cookieHeader);
    if (cookie.kind !== "present") return Object.freeze([]);
    return accountCredentialDigestCandidates(cookie.value, hmacKeyring);
  }
  function requiredCredentials(cookieHeader: string | null) {
    const selected = credentials(cookieHeader); if (selected.length === 0) invalid(); return selected;
  }
  function operationBase(input: OperationAuthority, payload: unknown, kind: string) {
    const current = nowValue(now);
    return Object.freeze({ hostname: input.hostname, now: current, candidates: requiredCredentials(input.cookieHeader), operationId: input.operationId, fingerprint: fingerprint(kind, payload), correlationId: correlation(kind, input.operationId) });
  }

  const runtime: StorefrontIdentityRuntime = {
    async start(input) {
      const current = nowValue(now); const email = normalizeStorefrontAccountEmail(input.email); const challengeId = uuid(randomUuid); const outboxId = uuid(randomUuid); const code = randomLoginCode(); const ticket = createStorefrontMagicTicket(randomBytes);
      if (!CODE.test(code)) invalid();
      const emailAuthority = accountHostnameEmailDigest(input.hostname, email, hmacKeyring);
      const requestAuthority = accountRequestDigest(input.hostname, input.requestAuthority, hmacKeyring);
      const codeAuthority = accountHostnameCodeDigest({ challengeId, hostname: input.hostname, email, code }, hmacKeyring);
      const ticketAuthority = accountHostnameTicketDigest({ challengeId, hostname: input.hostname, ticket }, hmacKeyring);
      const expiresAt = new Date(current.getTime() + 600_000);
      const sealed = sealAccountChallenge(Object.freeze({ challengeId, email, expiresAt: expiresAt.toISOString() }), sealKeyring, randomBytes);
      const result = await repository.start({
        hostname: input.hostname, now: current, challengeId, emailDigest: emailAuthority.digest, requestDigest: requestAuthority.digest,
        codeKeyId: codeAuthority.keyId, codeDigest: codeAuthority.digest, ticketKeyId: ticketAuthority.keyId, ticketDigest: ticketAuthority.digest, expiresAt, outboxId, recipientCiphertext: sealed,
        brandSnapshot: Object.freeze({ name: input.brand.storeName, logoUrl: input.brand.logoUrl, primaryColor: input.brand.primaryColor }), correlationId: correlation("auth", challengeId),
      });
      await deliverLoginCode(Object.freeze({ email, ticket: serializeAccountMagicTicket(sealed, ticket), code, storeName: input.brand.storeName, storeOrigin: `https://${input.hostname}`, returnTo: input.returnTo, idempotencyKey: outboxId }));
      return Object.freeze({ result, setCookie: serializeAccountChallengeCookie(sealed) });
    },
    async verify(input) {
      const current = nowValue(now);
      const ticketAuthority = "ticket" in input ? openAccountMagicTicket(input.ticket, sealKeyring) : null;
      const raw = "ticket" in input ? null : challengeValue(input.challengeCookie);
      const challenge = ticketAuthority?.challenge ?? (raw ? openAccountChallenge(raw, sealKeyring) : null);
      if (!challenge || new Date(challenge.expiresAt) <= current || (!("ticket" in input) && !CODE.test(input.code))) invalid();
      const emailAuthority = accountHostnameEmailDigest(input.hostname, challenge.email, hmacKeyring);
      const verifier = "ticket" in input
        ? accountHostnameTicketDigest({ challengeId: challenge.challengeId, hostname: input.hostname, ticket: ticketAuthority!.ticket }, hmacKeyring)
        : accountHostnameCodeDigest({ challengeId: challenge.challengeId, hostname: input.hostname, email: challenge.email, code: input.code }, hmacKeyring);
      const accountId = uuid(randomUuid); const sessionId = uuid(randomUuid); const sessionCredential = createAccountSessionCredential(hmacKeyring, randomBytes); const csrf = csrfValue(randomBytes);
      const result = await repository.verify({
        hostname: input.hostname, now: current, challengeId: challenge.challengeId, emailDigest: emailAuthority.digest, verifierKind: "ticket" in input ? "ticket" : "code", verifierDigest: verifier.digest,
        email: challenge.email, accountId, sessionId, sessionKeyId: sessionCredential.keyId, sessionDigest: sessionCredential.digest,
        csrfDigest: accountCsrfDigest(sessionId, csrf, hmacKeyring).digest, deviceLabel: input.deviceLabel,
        userAgentDigest: accountUserAgentDigest(input.hostname, input.userAgent, hmacKeyring).digest, correlationId: correlation("verify", sessionId),
      });
      return Object.freeze({ result, setCookies: Object.freeze([serializeAccountCookie(sessionCredential.value), serializeCsrf(csrf), serializeAccountChallengeCookieDeletion()]) });
    },
    async completeProfile(input) {
      const nextSession = uuid(randomUuid); const customerId = uuid(randomUuid); const credential = createAccountSessionCredential(hmacKeyring, randomBytes); const csrf = csrfValue(randomBytes);
      const payload = { firstName: input.firstName, lastName: input.lastName, phone: input.phone ?? null };
      const result = await repository.completeProfile({ ...operationBase(input, payload, "profile_complete"), customerId, firstName: input.firstName, lastName: input.lastName, ...(input.phone ? { phone: input.phone } : {}), fullSessionId: nextSession, sessionKeyId: credential.keyId, sessionDigest: credential.digest, csrfDigest: accountCsrfDigest(nextSession, csrf, hmacKeyring).digest, deviceLabel: input.deviceLabel, userAgentDigest: accountUserAgentDigest(input.hostname, input.userAgent, hmacKeyring).digest });
      return Object.freeze({ result, setCookies: Object.freeze([serializeAccountCookie(credential.value), serializeCsrf(csrf)]) });
    },
    async session(hostname, cookieHeader) {
      const selected = credentials(cookieHeader);
      if (selected.length === 0) return Object.freeze({ outcome: "unauthenticated" as const, ...(cookieHeader ? { setCookie: serializeAccountCookieDeletion() } : {}) });
      const result = await repository.session({ hostname, now: nowValue(now), candidates: selected });
      return result.outcome === "unauthenticated" ? Object.freeze({ ...result, setCookie: serializeAccountCookieDeletion() }) : result;
    },
    async logout(hostname, cookieHeader) {
      const selected = credentials(cookieHeader);
      if (selected.length > 0) await repository.logout({ hostname, now: nowValue(now), candidates: selected, correlationId: correlation("logout", createHash("sha256").update(selected[0]!.digest).digest("hex").slice(0, 32)) });
      return Object.freeze({ setCookies: Object.freeze([serializeAccountCookieDeletion(), deleteCsrf(), serializeAccountChallengeCookieDeletion()]) });
    },
    async logoutAll(input) {
      const selected = requiredCredentials(input.cookieHeader);
      const revoked = await repository.logoutAll({ hostname: input.hostname, now: nowValue(now), candidates: selected, correlationId: `logout_all_${selected[0]!.digest.slice(0, 32)}` });
      return Object.freeze({ revoked, setCookies: Object.freeze([serializeAccountCookieDeletion(), deleteCsrf()]) });
    },
    async updateProfile(input) { const payload = { firstName: input.firstName, lastName: input.lastName, phone: input.phone ?? null, expectedVersion: input.expectedVersion }; return Object.freeze({ result: await repository.updateProfile({ ...operationBase(input, payload, "profile_update"), firstName: input.firstName, lastName: input.lastName, ...(input.phone ? { phone: input.phone } : {}), expectedVersion: input.expectedVersion }) }); },
    async saveAddress(input) { return Object.freeze({ result: await repository.saveAddress({ ...operationBase(input, { address: input.address, expectedVersion: input.expectedVersion }, "address_save"), address: input.address, expectedVersion: input.expectedVersion }) }); },
    async deleteAddress(input) { return Object.freeze({ result: await repository.deleteAddress({ ...operationBase(input, { addressId: input.addressId, expectedVersion: input.expectedVersion }, "address_delete"), addressId: input.addressId, expectedVersion: input.expectedVersion }) }); },
    async favorite(input) { return Object.freeze({ result: await repository.favorite({ ...operationBase(input, { productId: input.productId, enabled: input.enabled }, "favorite"), productId: input.productId, enabled: input.enabled }) }); },
    async orders(input) { return repository.orders({ hostname: input.hostname, now: nowValue(now), candidates: requiredCredentials(input.cookieHeader), limit: input.limit }); },
    async order(input) { return repository.order({ hostname: input.hostname, now: nowValue(now), candidates: requiredCredentials(input.cookieHeader), orderReference: input.orderReference }); },
    async devices(input) { return repository.devices({ hostname: input.hostname, now: nowValue(now), candidates: requiredCredentials(input.cookieHeader) }); },
    async revokeDevice(input) { return Object.freeze({ result: await repository.revokeDevice({ ...operationBase(input, { deviceId: input.deviceId }, "device_revoke"), deviceId: input.deviceId }) }); },
  };
  return Object.freeze(runtime);
}
