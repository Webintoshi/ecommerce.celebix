# Order deletion and shipping quotes — native277

## Cause

Order deletion omitted quote sessions and their immutable `begin_quote`
operation records. Both retain restrictive foreign keys to the order. An order
with a quote but no shipment therefore failed deletion atomically, while the
impact reader counted only shipments and displayed zero shipping records.

## Shared repair

Native277 changes only `delete_order`, `order_deletion_impact` and
`shipping_fulfillment_guard_immutable`. Authorization, exact order confirmation,
expected version, deletion idempotency, debt closure and retained payment audit
remain in the existing deletion path.

Deletion locks the order, then acquires quote jobs and sessions without waiting.
Contention returns before any deletion or debt change, avoiding a lock inversion
with quote expiry polling. It removes only read-only quote preparation within the authorized
permanent-deletion context. A late quote worker cannot restore deleted data.
The shared immutable trigger keeps rejecting updates, shipment operations and
unrelated event deletions. Orders with shipment evidence or consumed quotes are
rejected before debt closure. Deletion never invokes a shipping provider.

The impact reader includes quote sessions in its existing shipping-record
count, preserving the panel response contract. No application rebuild,
deployment pin, environment, provider authority or background-worker change is
needed for the shared database repair.

## Verification and operation

Use `order-delete-quotes277.native.test.mjs` with Node24 and disposable
PostgreSQL16. It exercises the original failure, successful deletion/retry,
late worker handling, shipment protection, authorization and retained finance
behavior. Historical permanent-deletion assertions must continue to pass so
the existing deployment hook does not replay old migrations.

Apply only when the reviewed full predecessor catalogue matches native276.
The migration checks exact function definitions and security metadata and
saves their predecessors in a private owner-only backup relation. Assert the
reviewed native277 catalogue after application. Rollback is explicit and
rejects later function drift; do not automatically retry an uncertain apply.

Production verification uses read-only order dependencies and the panel's
deletion-impact preview. A real customer order must not be permanently deleted
as a test. Record the actual application receipt separately from this source
note.

## Applied verification

Applied at 2026-10-25T20:00Z from checkpoint `670a97b3a`, after a validated
private full `saas` archive. The live catalogue contains 2,060 routines with
metadata digest
`4cd1cd710e73ec8c162ed7826222e02563b07ac9430a4087c9b41253d7938ab4`.
All six application configurations/runtimes, payment authorities and the
existing order/quote/finance fingerprints remained unchanged by application.

The original order's refreshed live deletion preview successfully counted its
two quote sessions. Confirmation remained empty and unchecked; no live order
deletion was submitted. Root independently passed all 12 focused native checks,
the eight current-signup checks and nine historical-tariff checks. The official
generated signup proof was committed with the migration sources.
