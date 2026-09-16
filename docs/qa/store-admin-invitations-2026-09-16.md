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

Local disk has approximately 2GiB free; no full application build or disk cleanup started. Focused non-build tests can proceed. Full combined builds remain required before release.

## Source findings

- Generic merchant-admin save persists a record/event/idempotency outcome but does not enqueue email or create membership.
- Current returning-login issue/recovery functions require store_owner. Invitation acceptance needs a verified pre-membership identity grant, explicit confirmation, atomic membership creation and sanctioned session issuance for allowed active roles. Normal login after acceptance must also work; a one-time bypass is not sufficient.
- Order-email payloads, outbox and idempotency namespace are order-specific and cannot be reused by fabricating an order.
- No live provider/configuration or mailbox delivery success is claimed.

## Verification to complete

- Public contracts and strict normalization: implemented in cf3bfa21, export snapshot correction 6f1021c8, non-ASCII padding fix bb8bac58 and pre-normalization ASCII validation fix 73e25f1c. Focused invitation tests 8/8 PASS and contracts typecheck PASS on 73e25f1c. Initial package suite 338/339 PASS with the new-export snapshot failure; corrected snapshot separately 1/1 PASS. Do not describe this as a new single-run 339/339 result. Independent task review and two scoped fix re-reviews completed; no open findings in Task 1. This is not the final whole-feature security review.
- Token sealing: not yet implemented.
- PostgreSQL lifecycle, least-privilege/concurrency/rollback execution: not yet implemented or run.
- Invitation OIDC, browser binding, explicit acceptance and post-acceptance login: not yet implemented or run.
- Dedicated provider adapter, durable worker and panel UI: not yet implemented or run.
- Full regression/build/security review: pending.
- Controlled staging migration/release: not started.
- Real send/provider delivery/recipient acceptance/protected page: pending.

Resend's official idempotency documentation was checked on 2026-09-16: keys are retained for 24 hours. The dedicated worker must stop unsafe replay rather than retry after that horizon. Source: https://resend.com/docs/dashboard/emails/idempotency-keys
