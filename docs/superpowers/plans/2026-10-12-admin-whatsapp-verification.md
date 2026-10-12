# Admin WhatsApp verification — execution plan

Authority: ../specs/2026-10-12-admin-whatsapp-verification.md and the user's approved
in-chat plan. Base deccadfa9496d26bcde1c55f2a8047c1b3f79a6a; branch
codex/admin-whatsapp-verification in the existing attached isolated worktree.

## Global constraints

ROOT owns integration, final reviews, source refs, native/provider configuration
and shared deployments. Implementers edit only explicitly assigned files and do
not commit another agent's changes. No live mutation during implementation.
Write behavior tests, observe red, implement, observe green; do not run concurrent
builds/full suites. Preserve all payment/Google/owner/support/customer authorities.

## Tasks and dependency interfaces

1. **OIDC first-factor proof.** Scoped customizer and cryptographic proof verifier;
   optional provider wiring preserving legacy paths when disabled. Own
   self-serve-oidc/provider modules and tests only. Returns optional verified
   password-proof projection bound to existing expectedNonce.
2. **Native MFA authority.** Append-only native228 and isolated SQL tests; principal
   factor/pending/OTP/trust/backups/security-policy records, guarded session
   authority, repository/DTOs. Publish typed command signatures early for ROOT.
   Own new admin-login-security contracts/data folder (except crypto/delivery).
3. **Crypto/transport.** Server-only purpose-separated codec and admin message
   adapter with bounded provider response. Own new crypto/delivery files and
   tests only; no package/root indexes. Coordinate exact inputs with native DTOs.
4. **ROOT integration.** Owner pending gate instead of premature session issuance,
   authenticated internal operations, shared central panel code UI/routes and
   security management, webhook receiver/support reset. Use the three verified
   interfaces above; cover registration, invites, switching and legacy lineage.
5. **Review and acceptance.** Independent trust-boundary review; execute meaningful
   native concurrency/privilege fixtures and complete affected suites/builds.
6. **Controlled publication.** Freeze latest shared source/config; staged native
   and owner compatibility, panels NET→SITE, isolated canary/Alpler real OTP,
   trusted device/recovery/logout acceptance, then activate policy for all/new
   tenants. Preserve exact witnesses and record evidence/limitations.

## Per-task completion

Record concrete red/green commands/results, own scope diff, dependencies and
remaining integration work in the private plan ledger. No task is complete from
code existence or a mock alone. Critical/important review findings must be fixed
before activation; unverified real OTP delivery stays explicitly unverified.
