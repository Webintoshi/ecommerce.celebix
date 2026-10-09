# Brevo / Klaviyo connections

Implementation and shared publication date: 2026-10-09. Source `446557f574ef3d99081f54f2fe138b1fe487a55a` is running on both owners, both storefronts and both Customer Panels. Native migration 224 is applied. Klaviyo controls and full workers are enabled; Brevo remains disabled pending registration and key-handling clarification. Real merchant-key acceptance remains outstanding. See the [live release record](../qa/evidence/email-marketing-connections/live-release-20261009.md).

## Merchant flow

Pazarlama → E-posta contains two official, locally served provider logos. Each store uses its own account/key and one active provider. A merchant validates a key, chooses a list and reviews the consent audience before **Uygula** creates the connection. No customer export starts on connection, page opening, grants or profile edits. The explicit **Eşitle** button creates one finite local queue from the current proven audience. Brevo's initial import requires a new dedicated list. The dialog warns that adding people can trigger provider automations. Campaign editing, scheduling, sending and reporting stay on the provider's official site. Previous Celebix campaign records remain at `/marketing/email/history`.

No provider SDK, campaign editor or dependency was added. Page opening reads local state; provider calls start only on explicit configuration or the separate worker. Logos and components belong only to the email route. Unknown sender/quota/suppression counts are displayed as unknown.

## Consent and outbound scope

Only proven email-address consent is eligible. Optional names, original consent time/source/version and managed-list membership may leave Celebix. Phone, address, carts, orders, debts and catalog data do not. Historical newsletter/cart proof is considered; existing customer denials and archives also apply. An old customer checkbox never establishes a new grant. Address changes clear the UI checkbox, do not copy consent to the replacement email, and remove old membership. Name edits preserve the consent date and wait for the next explicit Eşitle. Purchase/order-contract acceptance does not generate marketing evidence.

Provider account denials are store-wide; list denials affect only the connected list. Suppressed, existing or uncertain profiles are never automatically resubscribed. Brevo excludes first-import consent older than two years. Restoring a suppressed profile requires the provider's own reconsent flow.

## Configuration

Server-only settings:

- Panel: `CELEBIX_EMAIL_MARKETING_CONNECTIONS_ENABLED=true` plus the existing merchant credential keyring. Default is disabled. The native capability probe must pass.
- Panel: `CELEBIX_EMAIL_MARKETING_BREVO_ENABLED=false` independently gates Brevo. Enabling the global switch exposes Klaviyo without enabling Brevo.
- Owner: `CELEBIX_EMAIL_MARKETING_WORKER_MODE=off|revoke_only|full` and unique `CELEBIX_EMAIL_MARKETING_WORKER_ID`. Default is `off`.
- Owner database uses the current shared private database URL with `sslmode=verify-full`; restricted workflow role, PostgreSQL 16 and required native functions are checked before startup.
- Both panels and owner must share the active encryption key and retain previous keys while referenced effects/candidates remain. Rotate using the existing merchant-keyring procedure; never expose environment values in a manifest.

Secrets are AES-256-GCM envelopes bound to store, credential owner, provider, purpose and version. Validated candidates expire after 15 minutes. Only the original, leased, previously dispatched list-create operation can retain/read an expired candidate for recovery. Completed operations destroy the candidate key. Account identity cannot be shared with another store, including during draining.

## Worker and recovery

The production tick is five seconds, with two globally leased jobs across owner instances and a dedicated pool capped at four. Source writes atomically record evidence and negative cleanup intents; they do not queue positive exports or call providers. Each explicit sync uses a monotonically numbered batch and immutable per-job evidence/name snapshot. New batches are refused while queued/running/uncertain positive effects remain; replays return the original result. Historic unsent automatic imports are fenced. A single bulk native statement captures existing proof and queues contacts; provider processing remains separate. Polling uses a five-minute schedule, ten-minute delta overlap and daily full sweep; these are targets, not delivery guarantees.

Explicitly unissued/rejected effects can retry. A successful write followed by failed readback, timeout, malformed success or write 5xx remains unknown and must be read back. `202` is acceptance, never completion. A lost native lease/commit is not reported as verified. Authentication failures show reconnection required; validated rotation/recheck resumes only safely unsent authentication-blocked jobs. Consent/suppression blocks remain intact.

Disconnect enters draining. Retained keys and original dispatched evidence survive until recipient effects, membership removal and the owned authenticated hook are settled. Reconnecting selects the current live record rather than comparing generations across historical connection IDs. No financial or provider-send record is fabricated. Provider denials, readback of accepted/unknown effects, and draining/cleanup remain automatic; manual customer export does not eliminate these necessary background checks.

## Publication prerequisites and sequence

Native migration 224 was allocated and applied under the shared release owner: `apps/owner/scripts/sql/saas/202610090224_email_marketing_connections.{up,down}.sql`. The unnumbered files remain identical implementation/test inputs. Re-read active source/container/config/SQL baselines before further release operations; historical source pins are not current authority.

Brevo remains disabled pending its explicit registration requirement and key-handling clarification. Klaviyo private-key use outside marketplace publication is supported by the official guides below. Written clarification is our gate for ambiguous Brevo terms; it is not presented as a separate explicit provider mandate:

1. Brevo app registration and written clarification of its key-handling clause. Its [Developer Terms](https://developers.brevo.com/docs/apps-developer-terms) §§7.1 and 8(i) apply to distributable apps; §9.4 permits factual interoperability marks subject to terms. The required no-endorsement disclosure is in the dialog.
2. Klaviyo private-key authentication is supported for trusted third-party integrations by the [authentication guide](https://developers.klaviyo.com/en/docs/authenticate_) and [private-key guide](https://help.klaviyo.com/hc/en-us/articles/7423954176283). Marketplace OAuth/review is a separate publication path. The API Terms contain competitor/aggregation restrictions, but do not expressly classify this alternative provider chooser as requiring prior review. This release does not combine provider reports or offer campaign sending. Factual brand use does not claim endorsement.
3. Real merchant-key acceptance requires authorized accounts/recipient scope and automation settings. No production customer is a test fixture. The Brevo registration/key-handling request was sent with explicit user authorization on 2026-10-09; a response is pending. The optional Klaviyo clarification draft remains unsent.

Completed rollout: back up/rehearse → guarded native SQL → compatible owners NET→SITE in revoke-only mode → shared storefront readers NET→SITE → Customer Panels NET→SITE → verify all running sources/readers → enable Klaviyo controls/full workers → official owner NET→SITE and panel NET→SITE runtime restarts → verify all six running applications. Unrelated Google, payment, domain and encryption configuration was preserved. Real merchant-key testing is a separate outstanding acceptance step. New tenants receive the feature through the common app; each merchant still supplies their own provider account/key.

## Rollback

First close new exports with `revoke_only`; keep incoming denials, readback and cleanup operational. Compatible UI/source rollback must preserve retained keys/evidence. Populated SQL down refuses destructive rollback while evidence/connections remain. If the revocation worker cannot run, pause external sends and settle pending denials before rollback is complete. Do not silently remove the only working consent-revocation path.

See `docs/qa/evidence/email-marketing-connections/acceptance.md` for actual checks and limits.

## Shared rollout controls

`CELEBIX_EMAIL_MARKETING_CONNECTIONS_ENABLED` remains false by default and is now true on both shared panels. `CELEBIX_EMAIL_MARKETING_BREVO_ENABLED` is a separate server-side switch, false by default and still false in production; Brevo is displayed as preparation pending. HTTP paths enforce availability, not only buttons. Disconnect and narrowly bound existing-account cleanup key recovery remain possible if a provider is subsequently disabled. The authorized Brevo request has been sent; registration completion and provider approval have not been established. Real provider account acceptance remains distinct from software and deployment checks.
