import { createHash, randomBytes, randomUUID } from "node:crypto";
import { normalizeStoreAdminInvitationEmail, type StoreAdminInvitationRole } from "@celebix/saas-contracts";
import type { PanelBrowserBindingAuthorityCodec, PanelBrowserCredentialDigest } from "../panel-browser-binding/credential-codec.ts";
import type { ReturningPanelSessionIssuerResult } from "../panel-returning-login/postgres-session-issuer.ts";
import { beginOidcAuthorization, completeOidcCallback, rejectOidcProviderCallback, type OidcCallbackInput, type OidcInvitationContext, type OidcProviderPort, type OidcTransactionStore } from "../self-serve-oidc.ts";
import type { InvitationAcceptance, InvitationGrantPreview, InvitationIdentityRepository, InvitationProof } from "./repository.ts";
import { digestStoreAdminInvitationToken } from "./token.ts";

type Rejected = Readonly<{ kind: "invitation_rejected"; code: "invitation_unavailable" | "callback_unavailable" | "acceptance_unknown"; retryable: boolean }>;
type ConfirmationReady = Readonly<{ kind: "invitation_confirmation_ready"; grantCredential: string; grantExpiresAt: string; continuationPath: "/invitations/confirm" }>;
export type InvitationAuthCompletion = Rejected | ConfirmationReady | Readonly<{ kind: "not_invitation" }>;
export type InvitationAuthAcceptance = Rejected | Readonly<{ kind: "invitation_accepted_access_retry"; accepted: true; retryable: true }> | Readonly<{
  kind: "invitation_session_ready"; credential: string; activeStoreId: string; destinationOrigin: string; issuedAt: string; expiresAt: string;
}>;
type Inspection = "not_invitation" | "denied" | Readonly<{ kind: "approved"; context: OidcInvitationContext }>;
interface InvitationOidcStore extends OidcTransactionStore {
  inspectInvitationBinding(state: string, candidates: readonly PanelBrowserCredentialDigest[], now: Date): Promise<Inspection>;
  recoverInvitationContext(state: string, candidates: readonly PanelBrowserCredentialDigest[], now: Date): Promise<OidcInvitationContext | null>;
}
interface Options {
  provider: OidcProviderPort;
  transactionStore: InvitationOidcStore;
  repository: Pick<InvitationIdentityRepository, "resolve" | "grant" | "grantPreview" | "accept" | "recoverAcceptance">;
  browserBindingCodec: Pick<PanelBrowserBindingAuthorityCodec, "digestBrowserBindingCredential" | "digestBrowserBindingCredentialCandidates">;
  sessionIssuer: { issue(identity: { issuer: string; subject: string }, destinationHostname: string): Promise<ReturningPanelSessionIssuerResult> };
  callbackAuthority: string;
  panelOrigin: string;
  acceptanceOrigin: string;
  expectedIssuer: string;
  expectedAudience: string;
  expectedAuthorizationOrigin: string;
  clock(): Date;
}
class InvalidInvitationInput extends Error {
  constructor() { super("store_admin_invitation_auth_invalid"); }
}
function invalid(): never { throw new InvalidInvitationInput(); }
function hash(purpose: string, value: unknown): string { return createHash("sha256").update(`celebix-store-admin-invitation-${purpose}:v1\n`).update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex"); }
export function digestInvitationGrantCredential(value: unknown): string {
  if (typeof value !== "string" || !/^ig1\.[A-Za-z0-9_-]{43}$/.test(value) || Buffer.from(value.slice(4), "base64url").toString("base64url") !== value.slice(4)) invalid();
  return hash("grant", value);
}
const rejected = (code: Rejected["code"] = "invitation_unavailable", retryable = false): Rejected => Object.freeze({ kind: "invitation_rejected", code, retryable });
const accessRetry = (): InvitationAuthAcceptance => Object.freeze({ kind: "invitation_accepted_access_retry", accepted: true, retryable: true });

/** Owner-only identity service. No registration/tenant creation dependencies and no HTTP or cookie authority. */
export function createStoreAdminInvitationAuthService(options: Options) {
  const origin = new URL(options.panelOrigin);
  if (origin.protocol !== "https:" || origin.origin !== options.panelOrigin || origin.port || options.acceptanceOrigin !== options.panelOrigin || options.callbackAuthority !== `${options.panelOrigin}/auth/callback`) invalid();
  function now() { const value = options.clock(); if (!(value instanceof Date) || !Number.isFinite(value.getTime())) invalid(); return new Date(value); }
  function candidates(credential: string) {
    try { return options.browserBindingCodec.digestBrowserBindingCredentialCandidates(credential); }
    catch { return invalid(); }
  }
  function proof(credential: string, binding: PanelBrowserCredentialDigest): InvitationProof {
    return { grantDigest: digestInvitationGrantCredential(credential), browserKeyId: binding.keyId, browserDigest: binding.digest, now: now() };
  }
  function confirmation(context: OidcInvitationContext, grant: InvitationGrantPreview): ConfirmationReady {
    return Object.freeze({ kind: "invitation_confirmation_ready", grantCredential: context.grantCredential, grantExpiresAt: grant.expiresAt, continuationPath: "/invitations/confirm" });
  }
  async function recoverInvitationCompletion(state: string, browserCredential: string): Promise<InvitationAuthCompletion> {
    try {
      const context = await options.transactionStore.recoverInvitationContext(state, candidates(browserCredential), now());
      if (!context) return rejected();
      const grant = await options.repository.grantPreview(proof(context.grantCredential, context.browserBinding));
      if (grant.kind === "unavailable" || grant.kind === "commit_unknown") return rejected("callback_unavailable", true);
      if (grant.kind !== "grant_available" || grant.value.grantId !== context.grantId || grant.value.invitationId !== context.invitationId || grant.value.generation !== context.generation) return rejected();
      return confirmation(context, grant.value);
    } catch (error) { return error instanceof InvalidInvitationInput ? rejected() : rejected("callback_unavailable", true); }
  }
  async function previewInternal(grantCredential: string, browserCredential: string) {
    for (const binding of candidates(browserCredential)) {
      const p = proof(grantCredential, binding);
      const result = await options.repository.grantPreview(p);
      if (result.kind === "grant_available") return { proof: p, grant: result.value };
      if (result.kind === "unavailable" || result.kind === "commit_unknown") throw new Error("unavailable");
    }
    return null;
  }
  async function issueAccepted(value: InvitationAcceptance, grantCredential: string, browserCredential: string): Promise<InvitationAuthAcceptance> {
    try {
      const verified = await previewInternal(grantCredential, browserCredential);
      if (!verified || !verified.grant.accepted || verified.grant.invitationId !== value.invitationId || verified.grant.storeId !== value.storeId) return accessRetry();
      const issued = await options.sessionIssuer.issue({ issuer: verified.grant.issuer, subject: verified.grant.subject }, value.adminHostname);
      if (issued.kind !== "session_issued" || issued.activeStoreId !== value.storeId) return accessRetry();
      return Object.freeze({ kind: "invitation_session_ready", credential: issued.credential, activeStoreId: value.storeId,
        destinationOrigin: `https://${value.adminHostname}`, issuedAt: issued.issuedAt, expiresAt: issued.expiresAt });
    } catch { return accessRetry(); }
  }
  return Object.freeze({
    async start(token: string, browserCredential: string): Promise<Rejected | Readonly<{ kind: "invitation_login_ready"; providerAuthorizationUrl: string; browserBindingExpiresAt: string }>> {
      try {
        const tokenDigest = digestStoreAdminInvitationToken(token), browserBinding = options.browserBindingCodec.digestBrowserBindingCredential(browserCredential);
        const resolved = await options.repository.resolve(tokenDigest, now());
        if (resolved.kind !== "resolved") return rejected();
        const context = { invitationId: resolved.value.invitationId, generation: resolved.value.generation, tokenDigest, browserBinding,
          grantId: randomUUID(), grantCredential: `ig1.${randomBytes(32).toString("base64url")}` };
        const begun = await beginOidcAuthorization({ provider: options.provider, transactionStore: options.transactionStore,
          redirectUri: options.callbackAuthority, expectedCallbackAuthority: options.callbackAuthority, returnTo: "/invitations/confirm", invitationContext: context,
          expectedIssuer: options.expectedIssuer, expectedAudience: options.expectedAudience, expectedAuthorizationOrigin: options.expectedAuthorizationOrigin, now });
        return Object.freeze({ kind: "invitation_login_ready", providerAuthorizationUrl: begun.authorizationUrl, browserBindingExpiresAt: begun.expiresAt });
      } catch { return rejected(); }
    },
    recoverInvitationCompletion,
    async tryComplete(callback: OidcCallbackInput, browserCredential: string): Promise<InvitationAuthCompletion> {
      try {
        if (!callback || typeof callback.state !== "string" || callback.state !== callback.state.trim() || callback.state.length < 16 || callback.state.length > 1024 || typeof callback.code !== "string" || !callback.code || callback.code !== callback.code.trim() || callback.code.length > 4096) return rejected();
        const inspected = await options.transactionStore.inspectInvitationBinding(callback.state, candidates(browserCredential), now());
        if (inspected === "not_invitation") return { kind: "not_invitation" };
        if (inspected === "denied") return recoverInvitationCompletion(callback.state, browserCredential);
        const completed = await completeOidcCallback({ provider: options.provider, transactionStore: options.transactionStore, callback, invitationBinding: inspected.context.browserBinding, now });
        const context = completed.invitationContext;
        if (!context || completed.returnTo !== "/invitations/confirm") return rejected();
        const resolved = await options.repository.resolve(context.tokenDigest, now());
        const email = normalizeStoreAdminInvitationEmail(completed.identity.email);
        if (resolved.kind !== "resolved" || resolved.value.invitationId !== context.invitationId || resolved.value.generation !== context.generation || resolved.value.email !== email) return rejected();
        const instant = now(), expiresAt = new Date(Math.min(instant.getTime() + 300_000, Date.parse(resolved.value.expiresAt)));
        const grantDigest = digestInvitationGrantCredential(context.grantCredential);
        const grant = await options.repository.grant({ invitationId: context.invitationId, generation: context.generation, tokenDigest: context.tokenDigest,
          browserKeyId: context.browserBinding.keyId, browserDigest: context.browserBinding.digest, issuer: completed.identity.issuer, subject: completed.identity.subject,
          email, emailVerified: completed.identity.emailVerified, grantId: context.grantId, grantDigest, operationId: context.grantId,
          fingerprint: hash("grant-operation", [context.invitationId, context.generation, grantDigest, context.browserBinding, completed.identity.issuer, completed.identity.subject, email]), now: instant, expiresAt });
        if (grant.kind !== "granted" && grant.kind !== "operation_replayed" && grant.kind !== "commit_unknown") return rejected();
        // Even successful writes must resolve the durable verified grant. No caller identity recovery.
        return recoverInvitationCompletion(callback.state, browserCredential);
      } catch { return recoverInvitationCompletion(callback?.state, browserCredential); }
    },
    async tryRejectProvider(state: string, responseIssuer: string | undefined, browserCredential: string): Promise<InvitationAuthCompletion> {
      try {
        const inspected = await options.transactionStore.inspectInvitationBinding(state, candidates(browserCredential), now());
        if (inspected === "not_invitation") return { kind: "not_invitation" };
        if (inspected === "denied") return recoverInvitationCompletion(state, browserCredential);
        await rejectOidcProviderCallback({ transactionStore: options.transactionStore, state, responseIssuer, invitationBinding: inspected.context.browserBinding, now });
        return rejected();
      } catch { return rejected(); }
    },
    async preview(grantCredential: string, browserCredential: string): Promise<Rejected | Readonly<{ kind: "invitation_confirmation"; storeName: string; email: string; role: StoreAdminInvitationRole; expiresAt: string }>> {
      try {
        const result = await previewInternal(grantCredential, browserCredential);
        if (!result) return rejected();
        const { storeName, email, role, expiresAt } = result.grant;
        return Object.freeze({ kind: "invitation_confirmation", storeName, email, role, expiresAt });
      } catch (error) { return error instanceof InvalidInvitationInput ? rejected() : rejected("callback_unavailable", true); }
    },
    async accept(grantCredential: string, browserCredential: string, operationId: string): Promise<InvitationAuthAcceptance> {
      try {
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(operationId)) return rejected();
        const proofs = candidates(browserCredential).map(binding => {
          const p = proof(grantCredential, binding);
          return { ...p, operationId, fingerprint: hash("accept-operation", [operationId, p.grantDigest, p.browserKeyId, p.browserDigest]) };
        });
        // Recovery precedes live preview: a confirmed acceptance stays accepted even when its grant expires.
        for (const p of proofs) {
          const recovered = await options.repository.recoverAcceptance(p);
          if (recovered.kind === "operation_replayed") return issueAccepted(recovered.value, grantCredential, browserCredential);
          if (recovered.kind === "commit_unknown" || recovered.kind === "unavailable") return rejected("acceptance_unknown", true);
        }
        const verified = await previewInternal(grantCredential, browserCredential);
        if (!verified || verified.grant.accepted) return rejected();
        const p = proofs.find(p => p.browserKeyId === verified.proof.browserKeyId && p.browserDigest === verified.proof.browserDigest)!;
        const accepted = await options.repository.accept({ ...p, principalId: randomUUID(), membershipId: randomUUID() });
        if (accepted.kind === "accepted" || accepted.kind === "operation_replayed") return issueAccepted(accepted.value, grantCredential, browserCredential);
        if (accepted.kind === "commit_unknown") {
          const recovered = await options.repository.recoverAcceptance(p);
          return recovered.kind === "operation_replayed" ? issueAccepted(recovered.value, grantCredential, browserCredential) : rejected("acceptance_unknown", true);
        }
        return rejected();
      } catch (error) { return error instanceof InvalidInvitationInput ? rejected() : rejected("acceptance_unknown", true); }
    },
  });
}
