# Order Lifecycle Transactional Email Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver exactly-once logical, store-branded order lifecycle emails through Celebix's central Resend account without coupling provider availability to order, payment, or stock commits.

**Architecture:** A PostgreSQL `AFTER INSERT` trigger on immutable `saas.order_events` maps approved lifecycle events into a tenant-scoped transactional outbox. A leased owner worker obtains a bounded projection, seals the exact request, sends through Resend with one deterministic idempotency key, and consumes signed webhook receipts. Merchant-admin routes expose only a masked delivery history and safe retry acceleration.

**Tech Stack:** PostgreSQL 16, TypeScript 5.9, Node.js 20+, Next.js 16, React 19, `pg`, Node `crypto`, Resend HTTP API, Svix webhook verification.

## Global Constraints

- PostgreSQL is the only order, tenant, recipient, lifecycle, lease, and retry authority.
- Customer transactional email cannot be disabled; merchant new-order alerts can be disabled.
- The first release sends only `order_received`, `payment_completed`, `order_shipped`, `order_delivered`, `order_cancelled`, `refund_completed`, and `merchant_new_order`.
- `preparing` sends nothing; `manual_import` sends nothing; `manual` sends customer lifecycle mail but no merchant alert.
- Maximum provider attempts are eight with delays `30s, 2m, 10m, 1h, 3h, 6h, 12h`.
- Every retry uses `order-email/v1/{delivery-id}` and the same sealed request; no send occurs after its 24-hour provider window.
- No plaintext recipient, order payload, rendered body, provider response, API key, or webhook body is persisted in the outbox or logs.
- Worker and webhook database connections require PostgreSQL `sslmode=verify-full` outside isolated test harnesses.
- UI is Turkish, compact, open-canvas, and contains no Resend/SMTP/queue terminology.
- Implementation follows strict red-green-refactor TDD and commits after each independently reviewable task.

---

## File Map

### PostgreSQL authority

- Create `apps/owner/scripts/sql/saas/202608050089_order_transactional_email.up.sql`: outbox/provider-event relations, notification-setting extension, event trigger, workflow/admin functions, grants and RLS.
- Create `apps/owner/scripts/sql/saas/202608050089_order_transactional_email.down.sql`: guarded rollback and settings-contract reversal.
- Create `apps/owner/scripts/sql/saas/202608050089_order_transactional_email_assertions.sql`: executable schema, privilege, trigger, and function assertions.
- Create `apps/owner/scripts/sql/saas/order-transactional-email-migration.test.ts`: source/manifest contract tests.
- Create `apps/owner/scripts/sql/saas/phase4i-order-transactional-email-manifest.json`: SHA-256-pinned artifacts.
- Create `tests/saas-phase3/order-transactional-email/postgres-harness.mjs`: disposable PostgreSQL 16 behavior, concurrency, tenant, and rollback scenarios.

### Shared contracts and persistence

- Modify `packages/saas-contracts/src/orders/types.ts`: delivery status/event/summary contracts.
- Modify `packages/saas-contracts/src/orders/validation.ts`: exact delivery parser.
- Modify `packages/saas-contracts/src/orders/index.ts`: exports.
- Create `packages/saas-data/src/order-emails/types.ts`: workflow claim and outcome interfaces.
- Create `packages/saas-data/src/order-emails/repository.ts`: workflow/admin RPC repository.
- Create `packages/saas-data/src/order-emails/repository.test.ts`: SQL shape, parsing, and error tests.
- Create `packages/saas-data/src/order-emails/index.ts` and modify `packages/saas-data/src/index.ts`: public exports.

### Owner worker and provider boundary

- Create `apps/owner/lib/order-email/config.ts` and `config.test.ts`: fail-closed server configuration.
- Create `apps/owner/lib/order-email/seal.ts` and `seal.test.ts`: AES-256-GCM request envelope and key rotation.
- Create `apps/owner/lib/order-email/template.ts` and `template.test.ts`: escaped HTML/plain-text template rendering.
- Create `apps/owner/lib/order-email/resend.ts` and `resend.test.ts`: bounded Resend adapter and retry classification.
- Create `apps/owner/lib/order-email/worker.ts` and `worker.test.ts`: claim/seal/send/finalize cycle.
- Create `apps/owner/lib/order-email/production.ts`, `production.test.ts`, and `default.ts`: PostgreSQL preflight and scheduler.
- Modify `apps/owner/instrumentation.ts`: start one guarded order-email worker.

### Webhook boundary

- Add `svix` to `apps/owner/package.json` and update `package-lock.json`.
- Create `apps/owner/lib/order-email/webhook.ts` and `webhook.test.ts`: raw-body signature verification and finite event mapping.
- Create `apps/owner/app/api/webhooks/resend/order-email/route.ts` and `route.test.ts`: public no-store webhook endpoint.

### Merchant admin

- Modify `packages/saas-data/src/orders/types.ts`, `repository.ts`, and `repository.test.ts`: list/retry order deliveries.
- Modify `apps/customer-panel/lib/server-orders/runtime.ts` and `runtime.test.ts`: repository readiness.
- Modify `apps/customer-panel/lib/order-http/handler.ts`, `handler.test.ts`, `request-input.ts`: authenticated delivery list/retry handlers.
- Create `apps/customer-panel/app/api/orders/[orderId]/notifications/route.ts`.
- Create `apps/customer-panel/app/api/orders/[orderId]/notifications/[deliveryId]/retry/route.ts`.
- Modify `apps/customer-panel/lib/order-ui/client.ts` and `apps/customer-panel/lib/order-console.test.ts`: exact UI client contract.
- Modify `apps/customer-panel/components/orders/OrderDetailConsole.tsx` and `order-console.module.css`: compact **Bildirimler** timeline.
- Modify `packages/saas-data/src/merchant-admin/validation.ts` and tests: new setting keys.
- Modify `apps/customer-panel/lib/merchant-admin-ui/presentation.ts` and its tests: singleton quiet notification editor.

---

### Task 1: PostgreSQL transactional outbox and event trigger

**Files:** SQL authority and migration artifacts listed above.

**Interfaces:**
- Produces `saas.order_email_work_claim(text,timestamptz,timestamptz,integer,uuid)`.
- Produces `saas.order_email_work_seal(uuid,uuid,text,timestamptz,text,bytea,text,text,text,timestamptz,timestamptz)`.
- Produces `saas.order_email_work_accept(uuid,uuid,text,timestamptz,text)` and `saas.order_email_work_fail(uuid,uuid,text,timestamptz,text,boolean,timestamptz)`.
- Produces `saas.order_email_provider_event_record(text,text,text,timestamptz,timestamptz,text)`.
- Produces `saas.order_email_admin_list(...)` and `saas.order_email_admin_retry(...)`.

- [ ] **Step 1: Write failing migration contract tests**

```ts
test("089 installs a private event-triggered transactional outbox", () => {
  assert.match(up, /CREATE TABLE saas[.]order_email_deliveries/u);
  assert.match(up, /CREATE TRIGGER order_events_enqueue_email/u);
  assert.match(up, /AFTER INSERT ON saas[.]order_events/u);
  assert.match(up, /FOR UPDATE SKIP LOCKED/u);
  assert.doesNotMatch(up, /GRANT\s+(?:SELECT|INSERT|UPDATE|DELETE).*order_email/isu);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --experimental-transform-types --test apps/owner/scripts/sql/saas/order-transactional-email-migration.test.ts`

Expected: FAIL because migration 089 and its manifest do not exist.

- [ ] **Step 3: Implement the minimal migration**

Create the two private tables, FORCE RLS, immutable provider receipts, indexes, trigger helper, trigger, exact workflow/admin functions, settings validation extension, grants, assertions, and guarded down migration. Use deterministic delivery IDs and:

```sql
UNIQUE(store_id,order_id,event_type,recipient_kind)
```

The trigger maps `order_created`, `status_transition`, and `payment_transition`; an already-completed created order inserts both customer events.

- [ ] **Step 4: Verify GREEN and artifact hashes**

Run the focused test, then calculate manifest hashes with `shasum -a 256` and rerun the test.

- [ ] **Step 5: Add and run the PostgreSQL 16 harness**

The harness must prove one row under event replay/concurrency, correct source/status matrix, rollback with commerce transaction, lease takeover, Store A/Store B denial, webhook replay, and guarded down behavior.

- [ ] **Step 6: Commit**

```bash
git add apps/owner/scripts/sql/saas/202608050089_order_transactional_email.* \
  apps/owner/scripts/sql/saas/order-transactional-email-migration.test.ts \
  apps/owner/scripts/sql/saas/phase4i-order-transactional-email-manifest.json \
  tests/saas-phase3/order-transactional-email/postgres-harness.mjs
git commit -m "feat: add transactional order email outbox"
```

### Task 2: Typed workflow and admin repositories

**Interfaces:**
- `PostgresOrderEmailWorkflowRepository.claim(input): Promise<OrderEmailClaimBatch>`.
- `seal`, `accept`, `fail`, and `recordProviderEvent` match the SQL functions from Task 1.
- `PostgresOrderRepository.listEmailDeliveries(input)` returns exact masked summaries.
- `PostgresOrderRepository.retryEmailDelivery(input)` returns the updated summary.

- [ ] **Step 1: Write failing repository tests** using literal SQL and complete PostgreSQL rows for unsealed/sealed claims, accepted outcomes, cross-shape corruption, and admin retry.
- [ ] **Step 2: Run** `npm test --workspace @celebix/saas-data -- --test-name-pattern="order email"` and verify missing exports fail.
- [ ] **Step 3: Implement exact frozen types, parsers, repositories, and exports.** Repository code must call only the Task 1 RPCs under `celebix_saas_workflow` or existing tenant context.

```ts
export interface OrderEmailWorkflowRepository {
  claim(input: ClaimOrderEmailInput): Promise<OrderEmailClaimBatch>;
  seal(input: SealOrderEmailInput): Promise<void>;
  accept(input: AcceptOrderEmailInput): Promise<void>;
  fail(input: FailOrderEmailInput): Promise<void>;
  recordProviderEvent(input: RecordOrderEmailProviderEventInput): Promise<"recorded" | "replayed">;
}
```
- [ ] **Step 4: Rerun focused and full `@celebix/saas-data` tests.**
- [ ] **Step 5: Commit** with `feat: add order email repositories`.

### Task 3: Sealed request and accessible templates

**Interfaces:**
- `sealOrderEmailRequest(request,keyring): OrderEmailSealedEnvelope`.
- `openOrderEmailRequest(envelope,keyring): OrderEmailProviderRequest`.
- `renderOrderEmail(input): { subject:string; html:string; text:string }`.

- [ ] **Step 1: Write failing tests** for authenticated encryption, wrong-key rejection, rotation, buffer wiping, HTML escaping, no remote/script/form/pixel markup, logo fallback, tracking presence/absence, public links, and plain-text parity.
- [ ] **Step 2: Run focused owner tests and verify RED.**
- [ ] **Step 3: Implement AES-256-GCM version `oe1` envelopes and the seven typed Turkish templates.** Use no React runtime and no arbitrary HTML input.

```ts
export type OrderEmailProviderRequest = Readonly<{
  from: string; to: string; replyTo?: string; subject: string; html: string; text: string;
}>;
export function renderOrderEmail(input: OrderEmailTemplateInput): Readonly<{subject:string;html:string;text:string}>;
```
- [ ] **Step 4: Rerun focused tests and owner typecheck.**
- [ ] **Step 5: Commit** with `feat: add branded order email templates`.

### Task 4: Resend adapter and retry state machine

**Interfaces:**
- `sendOrderEmail(request, options): Promise<{kind:"accepted";providerMessageId:string}|{kind:"retryable"|"permanent";code:string}>`.
- `retryDelayMs(attempt:1|2|3|4|5|6|7): number` returns the exact approved schedule.

- [ ] **Step 1: Write failing adapter tests** for the exact request, `Idempotency-Key`, test recipient substitution, bounded body, timeout, `429`, `500`, concurrent `409`, payload-conflict `409`, and permanent `4xx`.
- [ ] **Step 2: Verify RED.**
- [ ] **Step 3: Implement minimal fetch adapter and finite response classifier.** Never return provider response text.

```ts
export type OrderEmailSendResult = Readonly<
  | { kind: "accepted"; providerMessageId: string }
  | { kind: "retryable" | "permanent"; code: string }
>;
```
- [ ] **Step 4: Verify GREEN and mutation-check the retry branches.**
- [ ] **Step 5: Commit** with `feat: add resilient Resend order adapter`.

### Task 5: Leased owner worker and production startup

**Interfaces:**
- `createOrderEmailWorker(options).runOnce(): Promise<"empty"|"processed"|"failed">`.
- `initializeOrderEmailProductionRuntime(config).runOnce()`.
- `startDefaultOrderEmailProductionWorker().stop()`.

- [ ] **Step 1: Write failing worker/config/preflight tests** for disabled mode, verified-TLS database parsing, missing secret failure, claim/seal/send/accept, sealed retry, lease failure, retry schedule, eighth-attempt terminal state, and expired idempotency window.
- [ ] **Step 2: Verify RED.**
- [ ] **Step 3: Implement config, worker, production runtime, scheduler, and instrumentation registration.** Keep provider concurrency at two and claim batch at 25.

```ts
export type OrderEmailWorker = Readonly<{
  runOnce(): Promise<"empty" | "processed" | "failed">;
}>;
```
- [ ] **Step 4: Run focused owner tests, owner typecheck, and instrumentation regression tests.**
- [ ] **Step 5: Commit** with `feat: run transactional order email worker`.

### Task 6: Signed Resend webhook

**Interfaces:**
- `verifyOrderEmailWebhook(rawBody,headers,secret): VerifiedOrderEmailProviderEvent`.
- Route `POST /api/webhooks/resend/order-email` returns `200`, `400`, or `503` exactly as specified.

- [ ] **Step 1: Add `svix` and write failing verification/route tests** using a real Svix-signed fixture and raw request body.
- [ ] **Step 2: Verify RED.**
- [ ] **Step 3: Implement finite event mapping, repository receipt, duplicate acknowledgement, and no-store response headers.**

```ts
export type VerifiedOrderEmailProviderEvent = Readonly<{
  providerEventId: string;
  providerMessageId: string;
  type: "sent" | "delivered" | "delayed" | "failed" | "bounced" | "complained" | "suppressed";
  occurredAt: string;
  safeReasonCode?: string;
}>;
```
- [ ] **Step 4: Run focused tests and owner build/typecheck.**
- [ ] **Step 5: Commit** with `feat: process signed Resend delivery events`.

### Task 7: Merchant order notification history and retry

**Interfaces:**
- `GET /api/orders/{orderId}/notifications` returns `{items: OrderEmailDeliverySummary[]}`.
- `POST /api/orders/{orderId}/notifications/{deliveryId}/retry` returns one summary.

- [ ] **Step 1: Write failing contract, repository, HTTP, client, and component-controller tests** for masked data, authorization, hostile IDs/headers, retryable state, unavailable state, and exact Turkish labels.
- [ ] **Step 2: Verify RED in contracts, data, and customer-panel workspaces.**
- [ ] **Step 3: Implement types/parsers, routes, runtime readiness, client, and the compact `Bildirimler` section.** Fetch notification history alongside order detail; failed notification loading must not hide the order.

```ts
export type OrderEmailDeliverySummary = Readonly<{
  id: string; eventType: OrderEmailEventType; recipientKind: "customer" | "merchant";
  recipientMask: string; status: OrderEmailDeliveryStatus; occurredAt: string; canRetry: boolean;
}>;
```
- [ ] **Step 4: Run focused tests, customer-panel typecheck, and production build.**
- [ ] **Step 5: Commit** with `feat: show order notification history`.

### Task 8: Quiet merchant notification settings

**Interfaces:** `notification_setting.config` accepts `orderNotificationsEnabled:boolean` and `notificationEmail:string` plus the existing safe fields.

- [ ] **Step 1: Write failing TypeScript and UI-definition tests** for new keys, singleton behavior, strict email validation, hostile extra-key rejection, and removal of visible SMS/push controls from this screen.
- [ ] **Step 2: Verify RED.**
- [ ] **Step 3: Extend validation and presentation.** Fields are exactly **Yeni sipariş e-postası**, **Bildirim adresi**, **Gönderici adı**, and **Yanıt adresi**.

```ts
notification_setting: {
  orderNotificationsEnabled: true,
  notificationEmail: "siparis@example.com",
  senderLabel: "Mağazam",
  replyToEmail: "destek@example.com",
}
```
- [ ] **Step 4: Run merchant-admin and customer-panel suites.**
- [ ] **Step 5: Commit** with `feat: configure merchant order alerts`.

### Task 9: Full verification, push, migration, deployment, and live gate

- [ ] **Step 1: Run migration source tests and PostgreSQL 16 harness.**
- [ ] **Step 2: Run `@celebix/saas-contracts`, `@celebix/saas-data`, owner, and customer-panel tests/typechecks.**
- [ ] **Step 3: Run owner and customer-panel production builds.**
- [ ] **Step 4: Run secret/PII scans over changed source and captured test logs.**
- [ ] **Step 5: Use `superpowers:verification-before-completion`, review the full diff, and fix every regression with a failing test first.**
- [ ] **Step 6: Push the branch, apply migration 089 with worker disabled, deploy, and verify health.**
- [ ] **Step 7: Configure Resend and webhook secrets in Coolify; run Güzide in `test` mode through all lifecycle events.**
- [ ] **Step 8: Enable `live` only after test-mode receipts, admin history, retry behavior, and PII-safe logs pass.**
