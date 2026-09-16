# Store administrator invitations — implementation and readiness

Status: IN PROGRESS. No invitation email sent, no membership granted, no migration or deployment executed by this task.

User approved the written design on 2026-09-16. Existing generic invitation record must remain the sole source record for explicit conversion. Do not interpret its Active status as email delivery or administrator access.

## Fresh read-only staging check — 2026-09-16 19:54 UTC

Authorized management SSH was used without extracting credentials. Checked only named application's settings, running container identity, selected environment-variable presence and deployment queue. No configuration writes.

| Application | Configured source pin | Container image tag | Runtime SOURCE_COMMIT |
|---|---|---|---|
| Customer Panel | 4fffd63c0391dc2ab7d5ef265188ca725d997b12 | 4fffd63c0391dc2ab7d5ef265188ca725d997b12 | Not re-read in this check |
| Owner | 17e6c10f543917c3c4c85b6d662bce299a8da2ae | 65f0500ae544d4bccb4fbc3006b4b9e307d1e66e | 17e6c10f543917c3c4c85b6d662bce299a8da2ae |
| Storefront | d8143c4b315d25ada88be4a9517989cff4629627 | c09d59a21944fb24ef82cf904db5e444ec1d4fd5 | Not re-read in this check |
| Analytics Worker | d8143c4b315d25ada88be4a9517989cff4629627 | ad2c7d479457fcc2ad0595d32476efebab20fe6d | ad2c7d479457fcc2ad0595d32476efebab20fe6d |

These observations are deliberately separate. Pin, image tag and SOURCE_COMMIT are not sufficient proof of a container's actual source files. Prior source claims are not silently reused for the next release; relevant file/build metadata comparison is still required. Do not redeploy other applications to reconcile labels during this task.

Follow-up file-hash check on the running Owner container: `self-serve-oidc.ts`, `panel-returning-login/service.ts`, and `order-email/config.ts` exactly match those three files from 17e6c10f543917c3c4c85b6d662bce299a8da2ae. SHA256 respectively: 5800648c4aefb2361318b041d8c43ac53705ea585734dd9d674639e8bb3fc3a0; 06fe0bce8375b7f74244b2219f33433ec8ddd3d4672778d8858ea0e4d00c8a36; 09ee9ba0998f4b72b08692b00ab7f4b6b9f49437022eb2aa42dfa365e9ee3e8b. This supports the relevant source diagnosis despite the older image label; it is not a whole-image attestation.

All four application's Auto Deploy and Preview Deployments settings were false. Global queued/in-progress deployment count was zero at observation time.

Owner and Worker runtime lack `CELEBIX_ORDER_EMAIL_RESEND_API_KEY`, `CELEBIX_ORDER_EMAIL_FROM`, `CELEBIX_ORDER_EMAIL_RESEND_WEBHOOK_SECRET`, and `CELEBIX_ORDER_EMAIL_PAYLOAD_KEYRING`. Owner order-email worker mode is disabled. Coolify's selected environment-key inventory agrees: no configured invitation delivery/provider settings on Owner/Worker. This is a live delivery gate, not a test failure.

Storefront has a separate account-email Resend credential configured (presence only observed). Its credential was not read, copied or reused; its permissions/sender verification do not establish invitation delivery readiness. Requested that the user open their existing authorized Resend account to establish sender readiness without sharing secrets in chat. No new provider account is authorized or created.

## Resend account verification — resumed user session

The user opened Resend in their existing Chrome Sadık Ahmet profile. Read-only inspection of the Celebix team at `https://resend.com/domains` showed one domain: `noreply.celebix.net`, status **Verified**. Its details screen explicitly reports the domain is ready to send emails (Ireland/eu-west-1). No email was sent; no DNS, tracking or TLS setting was changed. The verified sender-domain gate is satisfied, but an invitation-scoped Owner runtime credential is still absent. This does not establish mailbox delivery or invitation acceptance.

The API-keys list was opened to inspect names/permissions only; existing key detail pages were not opened, full key values were not revealed or copied, and no key was generated/revoked by the agent. No dedicated invitation key was listed. The user was asked to create a separate `Celebix Admin Invitations (staging)` key with Sending access restricted to `noreply.celebix.net`, retain it in their own secure password manager, and never send it in chat. Credential installation into the authorized staging secret field remains a separate pending step. Existing Storefront/other keys remain unchanged. Official supported scope reference: https://resend.com/docs/dashboard/api-keys/introduction

Local disk has approximately 2GiB free; no full application build or disk cleanup started. Focused non-build tests can proceed. Full combined builds remain required before release.

## Follow-up — 2026-09-17

User confirmed the dedicated key is ready. This is user-reported preparation, not runtime installation or a successful provider authentication check. The API-key creation screen was not inspected; no key was read, copied, stored in code or requested in chat.

Existing Chrome profile Sadık Ahmet still exposes the authenticated admin tab on `https://admin.guzidekuyumcu.com/`, showing tenant `guzide-kuyumcu-4` and `Mağaza sahibi`. This is the inviter's existing session, not evidence that the invitee can sign in. No logout or customer mutation occurred.

No Coolify tab is exposed in that browser. A read-only query of Coolify's own instance FQDN returned empty; it does not establish the absence of any external HTTPS management route. Requested the user's existing HTTPS management URL to prepare safe user-controlled key entry. No HTTP/IP credential prompt, certificate bypass or management configuration change was attempted. Runtime installation remains pending.

Task 3 local mail configuration/renderer/transport implemented in `a36ebc3c60a8446c6e81ab860ba7b19dc0b5ae74`. Focused new tests16/16, existing token/seal11/11, order-email adapter4/4 and Owner typecheck passed in the implementation run. Independent task review: spec compliant and quality approved, no Critical/Important findings. Existing module-type warning remains as a disclosed minor. Disabled-by-default configuration defines dedicated `CELEBIX_ADMIN_INVITATIONS_RESEND_API_KEY`; no live environment values were installed or enabled. Database authority, verified acceptance, durable worker and panel integration are separate unfinished gates. Response timeouts and malformed responses are not reported as delivery. Exact-payload persistence, replay-horizon enforcement, verified webhooks and membership-preservation checks remain future integration gates, not established by this review.

## Source findings

- Generic merchant-admin save persists a record/event/idempotency outcome but does not enqueue email or create membership.
- Current returning-login issue/recovery functions require store_owner. Invitation acceptance needs a verified pre-membership identity grant, explicit confirmation, atomic membership creation and sanctioned session issuance for allowed active roles. Normal login after acceptance must also work; a one-time bypass is not sufficient.
- Order-email payloads, outbox and idempotency namespace are order-specific and cannot be reused by fabricating an order.
- No live provider/configuration or mailbox delivery success is claimed.

## Verification to complete

- Public contracts and strict normalization: implemented in cf3bfa21, export snapshot correction 6f1021c8, non-ASCII padding fix bb8bac58 and pre-normalization ASCII validation fix 73e25f1c. Focused invitation tests 8/8 PASS and contracts typecheck PASS on 73e25f1c. Initial package suite 338/339 PASS with the new-export snapshot failure; corrected snapshot separately 1/1 PASS. Do not describe this as a new single-run 339/339 result. Independent task review and two scoped fix re-reviews completed; no open findings in Task 1. This is not the final whole-feature security review.
- Token generation and encrypted delivery payload: implemented in 32e95d6a; independent review found an intermediate plaintext-buffer cleanup defect, fixed in 95e570c3047b2dcbb8c20c69cbca4b3937ea5767. Real-crypto regression evidence: RED 0/2, GREEN 2/2; final focused token/seal run 11/11 PASS and Owner typecheck PASS on that source. Unchanged order-email sealing regression 2/2 PASS was recorded before the fix. Scoped independent re-review confirms the finding addressed and no new breakage; Task 2 review is complete, not whole-feature security acceptance. Direct Node tests retain the existing MODULE_TYPELESS_PACKAGE_JSON warning. No production key or runtime wiring created; full build remains pending.
- PostgreSQL lifecycle, least-privilege/concurrency/rollback execution: not yet implemented or run.
- Invitation OIDC, browser binding, explicit acceptance and post-acceptance login: not yet implemented or run.
- Dedicated provider adapter/configuration/renderer: local implementation, tests and independent task review complete as recorded above. Durable worker, webhook integration and panel UI: not yet implemented or run.
- Full regression/build/security review: pending.
- Controlled staging migration/release: not started.
- Real send/provider delivery/recipient acceptance/protected page: pending.

Resend's official idempotency documentation was checked on 2026-09-16: keys are retained for 24 hours. The dedicated worker must stop unsafe replay rather than retry after that horizon. Source: https://resend.com/docs/dashboard/emails/idempotency-keys
