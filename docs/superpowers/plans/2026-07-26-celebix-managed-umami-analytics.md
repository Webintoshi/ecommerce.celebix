# Celebix Managed Umami Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver real, privacy-safe Umami v3 analytics for each verified Celebix storefront and expose only tenant-authorized aggregates in the customer-panel dashboard and `/analytics` console.

**Architecture:** PostgreSQL migration `039` owns the store-to-Umami Website ID workflow and durable purchase-event outbox. Customer-panel uses a server-only, strict self-hosted Umami client behind genuine `TenantContext`; storefront-shared receives only exact public tracker configuration from the host-resolver role and emits sanitized page and commerce events. Browser code never selects store/website authority or receives provider credentials.

**Tech Stack:** TypeScript 5.9, Node.js 20+, Next.js 16 App Router, React 19, PostgreSQL 16, `pg` 8, Recharts 3, Umami v3.1 protocol over native `fetch`, Node test runner, in-app browser verification.

## Global Constraints

- Implement from branch `codex/celebix-managed-umami-analytics` at spec commit `912df940d2f8aa1e4d43a076621ad592751f4f04`.
- Approved spec: `docs/superpowers/specs/2026-07-26-celebix-managed-umami-analytics-design.md`.
- `apps/admin/**` is immutable and read only; donor presentation authority is pinned to `fc6c5318b47f045a7cefcedc7612d5b10563ba32`.
- Do not introduce an iframe, admin reverse proxy, Supabase authority, legacy Logto admin session, `/api/admin/**`, browser tenant/store authority, or fake metric.
- Full `TenantContext`, provider credentials/tokens/bodies, internal authority UUIDs, visitor/session/event IDs, cookies, raw referrer paths/queries, and database configuration must not cross into client components, RSC, browser JSON, logs, analytics events, or errors.
- The public Umami Website ID may reach only the exact verified storefront tracker document selected server-side by hostname.
- No third-party SDK or dependency is added; use native `fetch` and existing dependencies only. `package-lock.json` must remain unchanged.
- Existing migrations `001–038` remain byte-for-byte unchanged. Add only migration `202607260039_store_analytics_authority` and its manifest.
- External network execution, staging deployment, production connection/mutation/deploy, credential changes, merge, and pilot activation remain disabled until Task 12 receives separate written authorization.
- Every code task follows focused RED -> GREEN -> REFACTOR and ends in its own non-amended commit.

## File and responsibility map

- `packages/saas-contracts/src/analytics/**`: exact immutable browser-safe analytics DTOs and parsers.
- `apps/owner/scripts/sql/saas/202607260039_*`: connection workflow, host projection, outbox, grants, rollback, and assertions.
- `packages/saas-data/src/analytics/**`: app, host-resolver, and workflow repositories with unknown-COMMIT recovery.
- `apps/customer-panel/lib/umami-provider/**`: private configuration, authentication, strict HTTP and provider parsing.
- `apps/customer-panel/lib/server-analytics/**`: approved-staging runtime facade and repository/client composition.
- `apps/customer-panel/lib/analytics-http/**`: authenticated request authority and safe HTTP projection.
- `apps/customer-panel/lib/analytics-ui/**`: same-origin browser client and immutable presentation helpers.
- `apps/storefront-shared/lib/analytics/**`: public configuration parser, safe tracker/event client, and worker composition.
- `apps/customer-panel/components/analytics/**`: real analytics console.
- `tests/saas-phase3/managed-umami-analytics/**`: cross-layer static/in-process/PostgreSQL evidence.

---

### Task 1: Frozen analytics contracts

**Files:**
- Create: `packages/saas-contracts/src/analytics/types.ts`
- Create: `packages/saas-contracts/src/analytics/validation.ts`
- Create: `packages/saas-contracts/src/analytics/index.ts`
- Create: `packages/saas-contracts/src/analytics/analytics.test.ts`
- Modify: `packages/saas-contracts/src/index.ts:136-end`

**Interfaces:**
- Consumes: no new application code; only existing contract validation conventions.
- Produces:

```ts
export type AnalyticsRange = "7d" | "30d" | "90d";
export type AnalyticsMetricType = "path" | "referrer" | "device" | "country";
export type AnalyticsConnectionStatus = "pending" | "active" | "disabled" | "failed";
export type AnalyticsConnectionView = Readonly<{
  schemaVersion: 1;
  provider: "umami";
  status: AnalyticsConnectionStatus;
  configured: boolean;
  hostname: string | null;
  version: number | null;
  lastVerifiedAt: string | null;
}>;
export type AnalyticsPoint = Readonly<{ at: string; value: number }>;
export type AnalyticsSummary = Readonly<{
  schemaVersion: 1;
  range: AnalyticsRange;
  asOf: string;
  pageviews: number;
  visitors: number;
  visits: number;
  bounces: number;
  totalTimeSeconds: number;
  activeVisitors: number;
  bounceRateBasisPoints: number;
  averageVisitSeconds: number;
  comparison: Readonly<{ pageviews: number; visitors: number; visits: number; bounces: number }> | null;
  pageviewsSeries: readonly AnalyticsPoint[];
  visitsSeries: readonly AnalyticsPoint[];
}>;
export type AnalyticsMetricRow = Readonly<{ label: string; value: number }>;
export type AnalyticsMetricResult = Readonly<{
  schemaVersion: 1;
  range: AnalyticsRange;
  type: AnalyticsMetricType;
  asOf: string;
  items: readonly AnalyticsMetricRow[];
}>;
export type AnalyticsConnectionMutationResult = Readonly<{
  status: AnalyticsConnectionStatus;
  version: number;
  updatedAt: string;
  replayed: boolean;
}>;
```

- [ ] **Step 1: Write eight failing parser tests**

Cover exact valid connection/summary/metric/mutation projections; unknown/private keys; invalid counters/arithmetic; noncanonical timestamps; unsafe path/referrer labels; dense series bounds; cardinality limits; and recursive immutability.

```ts
test("parses and deep-freezes one exact analytics summary", () => {
  const result = parseAnalyticsSummary(summaryFixture());
  assert.equal(result.bounceRateBasisPoints, 2500);
  assert.equal(Object.isFrozen(result.pageviewsSeries), true);
  assert.equal(result.pageviewsSeries.every(Object.isFrozen), true);
});

test("rejects provider and private authority material", () => {
  for (const key of ["websiteId", "storeId", "sessionId", "token", "providerBody"]) {
    assert.throws(() => parseAnalyticsSummary({ ...summaryFixture(), [key]: "private" }));
  }
});
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run:

```bash
node --experimental-strip-types --test packages/saas-contracts/src/analytics/analytics.test.ts
```

Expected: FAIL because `./index.ts` and parsers do not exist; `0/8` pass.

- [ ] **Step 3: Implement exact copy-and-freeze parsers**

Use own-key equality, safe non-negative integers, ISO round-trip timestamps, maximum 366 points, maximum 100 metric rows, path-only labels, and HTTPS-origin/`direct`/`unknown` referrer labels.

```ts
export function parseAnalyticsSummary(value: unknown): AnalyticsSummary {
  const source = exactRecord(value, SUMMARY_KEYS);
  const visits = safeCount(source.visits);
  const bounces = safeCount(source.bounces);
  if (bounces > visits) throw invalid();
  const expectedRate = visits === 0 ? 0 : Math.round((bounces * 10_000) / visits);
  if (safeCount(source.bounceRateBasisPoints) !== expectedRate) throw invalid();
  return Object.freeze({
    schemaVersion: 1,
    range: analyticsRange(source.range),
    asOf: timestamp(source.asOf),
    pageviews: safeCount(source.pageviews),
    visitors: safeCount(source.visitors),
    visits,
    bounces,
    totalTimeSeconds: safeCount(source.totalTimeSeconds),
    activeVisitors: safeCount(source.activeVisitors),
    bounceRateBasisPoints: expectedRate,
    averageVisitSeconds: safeCount(source.averageVisitSeconds),
    comparison: comparison(source.comparison),
    pageviewsSeries: points(source.pageviewsSeries),
    visitsSeries: points(source.visitsSeries),
  });
}
```

- [ ] **Step 4: Export the analytics module from the root contract**

```ts
export * from "./analytics/index.ts";
```

- [ ] **Step 5: Run focused and package tests GREEN**

Run:

```bash
node --experimental-strip-types --test packages/saas-contracts/src/analytics/analytics.test.ts
npm test --workspace @celebix/saas-contracts
npm run typecheck --workspace @celebix/saas-contracts
```

Expected: analytics `8/8`; workspace `100/100`; typecheck PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/saas-contracts/src/analytics packages/saas-contracts/src/index.ts
git commit -m "feat(analytics): add shared analytics contracts"
```

### Task 2: PostgreSQL connection and outbox authority

**Files:**
- Create: `apps/owner/scripts/sql/saas/202607260039_store_analytics_authority.up.sql`
- Create: `apps/owner/scripts/sql/saas/202607260039_store_analytics_authority.down.sql`
- Create: `apps/owner/scripts/sql/saas/202607260039_store_analytics_authority_assertions.sql`
- Create: `apps/owner/scripts/sql/saas/phase3h-analytics-manifest.json`
- Create: `tests/saas-phase3/managed-umami-analytics/postgres-harness.mjs`

**Interfaces:**
- Consumes: migration `038`, standard seven-field TenantContext authority tuple, `celebix_saas_app`, `celebix_saas_host_resolver`, `celebix_saas_workflow`, current domains/subscriptions/features/orders.
- Produces these exact callable functions:

```sql
saas.analytics_connection_get(uuid,uuid,uuid,uuid,text,bigint,timestamptz)
saas.analytics_connection_begin(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,uuid)
saas.analytics_connection_activate(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,uuid,text)
saas.analytics_connection_disable(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint)
saas.analytics_connection_recover_operation(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text)
saas.analytics_connection_get_for_host(text,timestamptz)
saas.analytics_outbox_claim(timestamptz,integer,interval)
saas.analytics_outbox_mark_delivered(uuid,text,timestamptz)
saas.analytics_outbox_mark_failed(uuid,text,timestamptz,text,timestamptz,boolean)
```

- [ ] **Step 1: Build the disposable PostgreSQL harness with 50 named scenarios**

The 50 scenarios are: manifest order/checksum; apply `001–039`; table/column types; constraints; indexes; triggers; RLS forced; app direct table denial; resolver direct table denial; workflow direct table denial; exact app function grants; exact resolver grant; exact workflow grants; helper non-exposure; default denied; store-owner read; admin read; editor/analyst read; feature denial; subscription expiry denial; inactive store denial; hostname absence denial; begin happy path; begin replay; begin fingerprint mismatch; concurrent begin single winner; Website ID uniqueness; cross-store Website ID denial; activate happy path; activate wrong domain denial; activate wrong Website ID denial; activate stale operation denial; disable happy path; disable stale version; recovery exact; public exact host; public alias denial; public unknown denial; public inactive connection denial; canonical hostname change invalidation; order-completed enqueue; unpaid order no enqueue; completed-update enqueue; settlement replay no duplicate; outbox claim bound; lease fencing; retry/backoff; permanent failure; backup/restore; rollback/reapply plus cleanup.

Harness startup order is Docker, Podman, then isolated native PostgreSQL 16. It never uses an external connection string, binds only loopback/random disposable ports, records PostgreSQL major/minor, and always terminates/removes its database, role, process/container, backup file, and temporary directory in `finally`.

```js
await scenario("concurrent begin has one durable winner", async () => {
  const [left, right] = await Promise.all([begin(OP_A), begin(OP_B)]);
  assert.equal([left.outcome, right.outcome].filter(value => value === "pending").length, 1);
  assert.equal(await scalar(admin, "SELECT count(*)::int FROM saas.store_analytics_connections WHERE store_id=$1", [STORE_ID]), 1);
});
```

- [ ] **Step 2: Run the harness and confirm RED**

Run:

```bash
node tests/saas-phase3/managed-umami-analytics/postgres-harness.mjs
```

Expected: FAIL at scenario 1 because migration/manifest files do not exist; `0/50` complete.

- [ ] **Step 3: Create connection, operation, and outbox tables**

```sql
CREATE TABLE saas.store_analytics_connections (
  id uuid PRIMARY KEY,
  store_id uuid NOT NULL REFERENCES saas.stores(id),
  provider text NOT NULL CHECK (provider='umami'),
  website_id uuid NOT NULL,
  hostname text NOT NULL,
  status text NOT NULL CHECK (status IN ('pending','active','disabled','failed')),
  version bigint NOT NULL CHECK (version>=1),
  last_verified_at timestamptz,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  UNIQUE (store_id),
  UNIQUE (website_id)
);

CREATE TABLE saas.analytics_connection_operations (
  id uuid PRIMARY KEY,
  store_id uuid NOT NULL REFERENCES saas.stores(id),
  kind text NOT NULL CHECK (kind IN ('begin','activate','disable')),
  fingerprint text NOT NULL CHECK (fingerprint ~ '^[0-9a-f]{64}$'),
  status text NOT NULL CHECK (status IN ('processing','committed')),
  result_payload jsonb,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE saas.analytics_delivery_outbox (
  id uuid PRIMARY KEY,
  store_id uuid NOT NULL REFERENCES saas.stores(id),
  order_id uuid NOT NULL REFERENCES saas.orders(id),
  connection_id uuid NOT NULL REFERENCES saas.store_analytics_connections(id),
  website_id uuid NOT NULL,
  event_kind text NOT NULL CHECK (event_kind='purchase'),
  payload jsonb NOT NULL,
  payload_digest text NOT NULL CHECK (payload_digest ~ '^[0-9a-f]{64}$'),
  status text NOT NULL CHECK (status IN ('pending','processing','delivered','failed')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 10),
  lease_token text,
  lease_expires_at timestamptz,
  next_attempt_at timestamptz NOT NULL,
  last_error_code text,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  delivered_at timestamptz,
  UNIQUE (store_id,order_id,event_kind)
);
```

- [ ] **Step 4: Implement SECURITY DEFINER authority functions**

Every merchant function sets `search_path=pg_catalog,saas`, validates the exact seven-field authority plus current active canonical domain and `analytics` feature, and returns `{outcome,result_payload}`. Begin accepts only server-generated UUIDs; activate requires exact persisted Website ID and hostname; public host projection performs exact active canonical resolution; direct table access remains revoked.

```sql
REVOKE ALL ON saas.store_analytics_connections,
  saas.analytics_connection_operations,
  saas.analytics_delivery_outbox
FROM PUBLIC,celebix_saas_app,celebix_saas_host_resolver,celebix_saas_workflow;

GRANT EXECUTE ON FUNCTION saas.analytics_connection_get(uuid,uuid,uuid,uuid,text,bigint,timestamptz)
  TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.analytics_connection_get_for_host(text,timestamptz)
  TO celebix_saas_host_resolver;
GRANT EXECUTE ON FUNCTION saas.analytics_outbox_claim(timestamptz,integer,interval),
  saas.analytics_outbox_mark_delivered(uuid,text,timestamptz),
  saas.analytics_outbox_mark_failed(uuid,text,timestamptz,text,timestamptz,boolean)
  TO celebix_saas_workflow;
```

- [ ] **Step 5: Add the completed-order outbox trigger**

Use an `AFTER INSERT OR UPDATE OF payment_status` trigger. It inserts only on a transition into `completed`, only when one active connection still matches the active store, canonical domain, subscription, and `analytics` feature at `NEW.updated_at`, and uses `ON CONFLICT (store_id,order_id,event_kind) DO NOTHING`. The internal `analytics_connection_is_current` helper is revoked from every runtime role. The payload contains only `valueCents`, `currency`, and public source enum; it excludes order number, customer/address, order/store IDs, and provider data.

```sql
IF NEW.payment_status='completed'
   AND (TG_OP='INSERT' OR OLD.payment_status IS DISTINCT FROM 'completed') THEN
  INSERT INTO saas.analytics_delivery_outbox(
    id,store_id,order_id,connection_id,website_id,event_kind,payload,payload_digest,
    status,attempt_count,next_attempt_at,created_at,updated_at
  )
  SELECT pg_catalog.gen_random_uuid(),NEW.store_id,NEW.id,connection.id,connection.website_id,
    'purchase',safe.payload,pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(safe.payload::text,'UTF8')),'hex'),
    'pending',0,NEW.updated_at,NEW.updated_at,NEW.updated_at
  FROM saas.store_analytics_connections AS connection
  CROSS JOIN LATERAL (
    SELECT pg_catalog.jsonb_build_object(
      'valueCents',NEW.total_cents,'currency',NEW.currency,'source',NEW.source
    ) AS payload
  ) AS safe
  WHERE connection.store_id=NEW.store_id AND connection.status='active'
    AND saas.analytics_connection_is_current(connection.id,NEW.updated_at)
  ON CONFLICT (store_id,order_id,event_kind) DO NOTHING;
END IF;
```

- [ ] **Step 6: Add rollback, catalog assertions, and manifest hashes**

Down migration drops trigger/functions/tables in dependency order and restores no earlier objects because `001–038` were not modified. Manifest lists `001–039` exact filenames and SHA-256 values.

```sql
DROP TRIGGER IF EXISTS orders_enqueue_analytics_purchase ON saas.orders;
DROP FUNCTION IF EXISTS saas.enqueue_analytics_purchase();
DROP FUNCTION IF EXISTS saas.analytics_outbox_mark_failed(uuid,text,timestamptz,text,timestamptz,boolean);
DROP FUNCTION IF EXISTS saas.analytics_outbox_mark_delivered(uuid,text,timestamptz);
DROP FUNCTION IF EXISTS saas.analytics_outbox_claim(timestamptz,integer,interval);
DROP TABLE IF EXISTS saas.analytics_delivery_outbox;
DROP TABLE IF EXISTS saas.analytics_connection_operations;
DROP TABLE IF EXISTS saas.store_analytics_connections;
```

- [ ] **Step 7: Run PostgreSQL GREEN**

Run:

```bash
node tests/saas-phase3/managed-umami-analytics/postgres-harness.mjs
```

Expected: `50/50 PASS`, PostgreSQL major `16`, backup/restore and rollback/reapply PASS, cleanup leaves no disposable database/container/process.

- [ ] **Step 8: Commit**

```bash
git add apps/owner/scripts/sql/saas/202607260039_* apps/owner/scripts/sql/saas/phase3h-analytics-manifest.json tests/saas-phase3/managed-umami-analytics/postgres-harness.mjs
git commit -m "feat(analytics): add store analytics authority"
```

### Task 3: PostgreSQL analytics repositories

**Files:**
- Create: `packages/saas-data/src/analytics/errors.ts`
- Create: `packages/saas-data/src/analytics/types.ts`
- Create: `packages/saas-data/src/analytics/validation.ts`
- Create: `packages/saas-data/src/analytics/repository.ts`
- Create: `packages/saas-data/src/analytics/public-repository.ts`
- Create: `packages/saas-data/src/analytics/outbox-repository.ts`
- Create: `packages/saas-data/src/analytics/repository.test.ts`
- Create: `packages/saas-data/src/analytics/public-repository.test.ts`
- Create: `packages/saas-data/src/analytics/outbox-repository.test.ts`
- Create: `packages/saas-data/src/analytics/index.ts`
- Modify: `packages/saas-data/src/index.ts:40-48`

**Interfaces:**

```ts
export type AnalyticsConnectionAuthority = Readonly<{
  connectionId: string;
  websiteId: string;
  hostname: string;
  status: AnalyticsConnectionStatus;
  version: number;
  lastVerifiedAt: string | null;
}>;
export type AnalyticsPendingAuthority = AnalyticsConnectionAuthority & Readonly<{
  outcome: "pending" | "active";
  replayed: boolean;
}>;
export type PublicAnalyticsTrackerConfig = Readonly<{
  websiteId: string;
  hostname: string;
}>;
export type AnalyticsOutboxClaim = Readonly<{
  eventId: string;
  leaseToken: string;
  websiteId: string;
  hostname: string;
  attemptCount: number;
  payload: Readonly<{ name: "purchase"; valueCents: number; currency: string; source: "storefront" | "quick_link" | "marketplace" | "manual_import" }>;
}>;
export type AnalyticsDeliveryErrorCode = "collector_unavailable" | "collector_rejected" | "collector_response_invalid";
export interface AnalyticsRepository {
  getConnection(input: Readonly<{ tenantContext: TenantContext; now: Date }>): Promise<AnalyticsConnectionView>;
  getConnectionAuthority(input: Readonly<{ tenantContext: TenantContext; now: Date }>): Promise<AnalyticsConnectionAuthority>;
  beginConnection(input: Readonly<{ tenantContext: TenantContext; now: Date; operationId: string; connectionId: string; websiteId: string }>): Promise<AnalyticsPendingAuthority>;
  activateConnection(input: Readonly<{ tenantContext: TenantContext; now: Date; operationId: string; connectionId: string; websiteId: string; verifiedHostname: string }>): Promise<AnalyticsConnectionMutationResult>;
  disableConnection(input: Readonly<{ tenantContext: TenantContext; now: Date; operationId: string; expectedVersion: number }>): Promise<AnalyticsConnectionMutationResult>;
}
export interface PublicAnalyticsRepository {
  getTrackerConfig(input: Readonly<{ hostname: string; now: Date }>): Promise<PublicAnalyticsTrackerConfig | null>;
}
export interface AnalyticsOutboxRepository {
  claim(input: Readonly<{ now: Date; limit: number; leaseMs: number }>): Promise<readonly AnalyticsOutboxClaim[]>;
  delivered(input: Readonly<{ eventId: string; leaseToken: string; now: Date }>): Promise<void>;
  failed(input: Readonly<{ eventId: string; leaseToken: string; now: Date; errorCode: AnalyticsDeliveryErrorCode; retryAt: Date; terminal: boolean }>): Promise<void>;
}
```

- [ ] **Step 1: Write 18 failing repository tests**

Merchant tests cover exact SQL/parameters, projection, role/feature errors, begin/activate/disable fingerprints, immutable results, acquisition failure, known rollback, commit-unknown read-only recovery, recovery mismatch, and no second write. Public tests cover exact host role, found/null/corrupt results, no IDs beyond public Website ID. Outbox tests cover bounded claim, lease copy/freeze, delivered/failure fencing, invalid payload, and worker-role isolation.

```ts
test("commit unknown performs recovery and never repeats activation", async () => {
  const fixture = repositoryFixture({ commit: "unknown", recovery: committedActivationRow() });
  const result = await fixture.repository.activateConnection(ACTIVATE_INPUT);
  assert.equal(result.replayed, true);
  assert.equal(fixture.sqlCalls.filter(call => call.includes("analytics_connection_activate")).length, 1);
  assert.equal(fixture.sqlCalls.filter(call => call.includes("analytics_connection_recover_operation")).length, 1);
});
```

- [ ] **Step 2: Confirm RED**

Run:

```bash
node --experimental-strip-types --test packages/saas-data/src/analytics/*.test.ts
```

Expected: FAIL on missing analytics module; `0/18` pass.

- [ ] **Step 3: Implement strict types, error map, and repositories**

```ts
export class AnalyticsRepositoryError extends Error {
  constructor(readonly code: AnalyticsErrorCode) {
    super(code);
    this.name = "AnalyticsRepositoryError";
  }
}

export class PostgresAnalyticsRepository implements AnalyticsRepository {
  constructor(private readonly options: PostgresAnalyticsRepositoryOptions) {}
  async getConnection(input: GetAnalyticsConnectionInput) {
    return projectConnectionView(await this.getConnectionAuthority(input));
  }
  async getConnectionAuthority(input: GetAnalyticsConnectionInput) {
    return executeAnalyticsRead(this.options, "analytics_connection_get", connectionArgs(input));
  }
  async beginConnection(input: BeginAnalyticsConnectionInput) {
    return executeRecoverableMutation(this.options, "analytics_connection_begin", beginArgs(input));
  }
  async activateConnection(input: ActivateAnalyticsConnectionInput) {
    return executeRecoverableMutation(this.options, "analytics_connection_activate", activateArgs(input));
  }
  async disableConnection(input: DisableAnalyticsConnectionInput) {
    const current = await this.getConnectionAuthority({ tenantContext: input.tenantContext, now: input.now });
    return executeRecoverableMutation(
      this.options,
      "analytics_connection_disable",
      disableArgs(input, current.connectionId),
    );
  }
}
```

Copy all caller dates/arrays/objects, use the existing pool timeout/configure/rollback/destroy patterns, and compute SHA-256 fingerprints over canonical exact inputs. On COMMIT failure destroy the client and call only `analytics_connection_recover_operation`; do not repeat the mutation.

- [ ] **Step 4: Export the module and run GREEN**

Run:

```bash
node --experimental-strip-types --test packages/saas-data/src/analytics/*.test.ts
npm test --workspace @celebix/saas-data
npm run typecheck --workspace @celebix/saas-data
```

Expected: analytics `18/18`; workspace `224/224`; typecheck PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/saas-data/src/analytics packages/saas-data/src/index.ts
git commit -m "feat(analytics): add postgres analytics repositories"
```

### Task 4: Hardened self-hosted Umami client

**Files:**
- Create: `apps/customer-panel/lib/umami-provider/config.ts`
- Create: `apps/customer-panel/lib/umami-provider/config.test.ts`
- Create: `apps/customer-panel/lib/umami-provider/media-type.ts`
- Create: `apps/customer-panel/lib/umami-provider/response.ts`
- Create: `apps/customer-panel/lib/umami-provider/parsers.ts`
- Create: `apps/customer-panel/lib/umami-provider/client.ts`
- Create: `apps/customer-panel/lib/umami-provider/client.test.ts`
- Modify: `apps/customer-panel/package.json:5-10` to include `lib/umami-provider/*.test.ts` in the existing test command; dependency objects remain unchanged.

**Interfaces:**

```ts
export type UmamiPrivateApiConfig = Readonly<{
  mode: "approved_staging";
  apiBaseUrl: string;
  username: string;
  password: string;
  timeoutMs: number;
  maximumResponseBytes: number;
  maximumMetricRows: number;
}>;
export type UmamiWebsite = Readonly<{
  id: string;
  name: string;
  domain: string;
}>;
export interface UmamiClient {
  createWebsite(input: Readonly<{ websiteId: string; name: string; domain: string }>): Promise<UmamiWebsite>;
  getWebsite(websiteId: string): Promise<UmamiWebsite | null>;
  summary(input: Readonly<{ websiteId: string; range: AnalyticsRange; timezone: string; now: Date }>): Promise<AnalyticsSummary>;
  metrics(input: Readonly<{ websiteId: string; range: AnalyticsRange; timezone: string; type: AnalyticsMetricType; now: Date }>): Promise<AnalyticsMetricResult>;
}
```

- [ ] **Step 1: Write nine failing configuration tests**

Cover disabled empty env, exact approved staging, production-like denial, incomplete credentials, HTTP/credentials/query/fragment/port, localhost/loopback/private/link-local/internal hosts, whitespace/control characters, and private output immutability.

```ts
test("private Umami config is fail-closed outside exact approved staging", async () => {
  assert.equal(await parseUmamiPrivateApiConfig({}, publicResolver()), null);
  for (const environment of [partialEnvironment(), productionLikeEnvironment(), privateHostEnvironment()]) {
    await assert.rejects(() => parseUmamiPrivateApiConfig(environment, publicResolver()), /umami_config_invalid/);
  }
});
```

- [ ] **Step 2: Write fifteen failing client tests**

Cover login bearer use, one cached token, read-only 401 relogin once, write 401 no retry, redirect/status/content-type/length/stream/fatal UTF-8/JSON rejection, exact create/get website, stats/pageviews/active merge, metric parsing/sanitization, timeout, maximum rows, secret-free errors/logs, and four-call concurrency bound.

The create fixture also proves the exact official Umami v3 request body `{id,name,domain}`; v3 documents optional `id` as a forced UUID assignment. No v2 fallback shape is accepted.

```ts
test("write 401 never retries create", async () => {
  const fixture = clientFixture([login200(), response401()]);
  await assert.rejects(() => fixture.client.createWebsite(WEBSITE));
  assert.equal(fixture.requests.filter(request => request.method === "POST" && request.path === "/api/websites").length, 1);
});
```

- [ ] **Step 3: Confirm RED**

Run:

```bash
node --experimental-transform-types --test apps/customer-panel/lib/umami-provider/*.test.ts
```

Expected: missing modules; `0/24` pass.

- [ ] **Step 4: Implement configuration and bounded JSON reader**

```ts
export const UMAMI_PRIVATE_ENVIRONMENT_FIELDS = Object.freeze([
  "CELEBIX_UMAMI_MODE",
  "CELEBIX_UMAMI_API_BASE_URL",
  "CELEBIX_UMAMI_USERNAME",
  "CELEBIX_UMAMI_PASSWORD",
] as const);

export async function readUmamiJson(response: Response, maximumBytes: number): Promise<unknown> {
  if (response.type === "opaqueredirect" || response.status < 200 || response.status >= 300) throw providerError(response.status);
  requireExactJsonMediaType(response.headers.get("content-type"));
  const bytes = await readBoundedBody(response.body, maximumBytes);
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}
```

At configuration parse time call `dns.promises.lookup(hostname,{all:true,verbatim:true})`; reject any IPv4/IPv6 loopback, private, link-local, multicast, unspecified, or documentation range and reject resolution changes within the same parse. Tests inject the resolver and never use external DNS.

- [ ] **Step 5: Implement auth and endpoint-specific provider calls**

Login is `POST /api/auth/login`; data requests use `Authorization: Bearer <token>`. Read-only first 401 clears token, performs one login, and repeats the exact GET once. `createWebsite` never retries its POST. All requests set `redirect:"manual"`, `cache:"no-store"`, a three-second abort signal, exact `Accept: application/json`, and bounded headers/body.

```ts
async createWebsite(input: CreateUmamiWebsiteInput): Promise<UmamiWebsite> {
  return parseWebsite(await this.requestJson("POST", "/api/websites", {
    body: Object.freeze({ id: uuid(input.websiteId), name: websiteName(input.name), domain: hostname(input.domain) }),
    retryAuthentication: false,
  }));
}
```

- [ ] **Step 6: Run GREEN**

Run:

```bash
node --experimental-transform-types --test apps/customer-panel/lib/umami-provider/*.test.ts
npm test --workspace @celebix/customer-panel
npm run typecheck --workspace @celebix/customer-panel
```

Expected: provider `24/24`; customer-panel `312/312`; typecheck PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/customer-panel/lib/umami-provider apps/customer-panel/package.json
git commit -m "feat(analytics): add hardened umami client"
```

### Task 5: Tenant-authorized analytics runtime and HTTP API

**Files:**
- Create: `apps/customer-panel/lib/server-analytics/{runtime,default,cache,runtime.test}.ts`
- Create: `apps/customer-panel/lib/analytics-http/{request-authority,request-input,handler,default,handler.test}.ts`
- Create: `apps/customer-panel/lib/analytics-ui/{client,client.test}.ts`
- Create: `apps/customer-panel/app/api/analytics/connection/route.ts`
- Create: `apps/customer-panel/app/api/analytics/summary/route.ts`
- Create: `apps/customer-panel/app/api/analytics/metrics/route.ts`
- Modify: `apps/customer-panel/lib/server-panel-access/postgres-runtime.ts:1-180`
- Modify: `apps/customer-panel/package.json:5-10` to add only the new test globs.

**Interfaces:**

```ts
export type ServerAnalyticsRuntime = Readonly<{
  mode: "approved_staging";
  analytics: AnalyticsRepository;
  umami: UmamiClient;
  cache: AnalyticsReadCache;
}>;
export type AnalyticsReadCacheKey = Readonly<{
  connectionId: string;
  websiteId: string;
  range: AnalyticsRange;
  timezone: string;
  metric: "summary" | AnalyticsMetricType;
}>;
export interface AnalyticsReadCache {
  get(key: AnalyticsReadCacheKey): AnalyticsSummary | AnalyticsMetricResult | null;
  set(key: AnalyticsReadCacheKey, value: AnalyticsSummary | AnalyticsMetricResult): void;
  invalidateConnection(connectionId: string): void;
}
export interface AnalyticsBrowserApi {
  connection(signal?: AbortSignal): Promise<AnalyticsConnectionView>;
  enable(input: Readonly<{ idempotencyKey: string }>, signal?: AbortSignal): Promise<AnalyticsConnectionMutationResult>;
  disable(input: Readonly<{ idempotencyKey: string; expectedVersion: number }>, signal?: AbortSignal): Promise<AnalyticsConnectionMutationResult>;
  summary(range: AnalyticsRange, signal?: AbortSignal): Promise<AnalyticsSummary>;
  metrics(range: AnalyticsRange, type: AnalyticsMetricType, signal?: AbortSignal): Promise<AnalyticsMetricResult>;
}
```

The browser never supplies tenant, store, hostname, provider, Website ID, connection ID, credential, time, or endpoint authority. The authenticated server derives full `TenantContext`; the repository derives the current private connection ID for disable.

- [ ] **Step 1: Write six failing runtime/cache tests**

Prove empty/partial/production-like environments are disabled; exact approved staging composes existing authenticated panel access, PostgreSQL analytics repository, private Umami client, and cache; caller-owned environment objects are copied; errors expose no secrets; cache keys isolate connection/Website/range/timezone/type; TTL never exceeds 30 seconds; errors are never cached; capacity is bounded at 128 immutable DTOs; and disable invalidates the exact connection only.

```ts
test("runtime resolves only when panel database and private provider profiles are both approved", async () => {
  assert.equal(await resolveServerAnalyticsRuntime({}), null);
  const runtime = await resolveServerAnalyticsRuntime(APPROVED_ENVIRONMENT, runtimeDependencies());
  assert.equal(runtime?.mode, "approved_staging");
  assert.equal(Object.isFrozen(runtime), true);
});

test("cache expires safely and never aliases a second connection", () => {
  const cache = createAnalyticsReadCache({ now: clock.now, ttlMs: 30_000, maximumEntries: 128 });
  cache.set(CACHE_KEY_A, SUMMARY);
  assert.equal(cache.get(CACHE_KEY_B), null);
  clock.advance(30_001);
  assert.equal(cache.get(CACHE_KEY_A), null);
});
```

- [ ] **Step 2: Write sixteen failing HTTP tests**

Cover authenticated reads; exact same-origin mutations; missing/wrong/comma/forwarded Origin denial; unsupported method/content type/body/key; idempotency replay; enable create; pending recovery via one provider GET; provider-create unknown outcome followed by one GET and no second POST; activation commit-unknown read-only recovery; disable deriving its private connection server-side; provider/feature/subscription failures; safe error projection; and no private authority fields in JSON.

```ts
test("provider create uncertainty performs one read-only recovery", async () => {
  const fixture = analyticsHttpFixture({ createWebsite: networkUnknown(), getWebsite: matchingWebsite() });
  const response = await fixture.handlers.connection.POST(enableRequest());
  assert.equal(response.status, 200);
  assert.equal(fixture.calls.createWebsite, 1);
  assert.equal(fixture.calls.getWebsite, 1);
  assert.equal(fixture.calls.activateConnection, 1);
});
```

- [ ] **Step 3: Write eight failing browser-client tests**

Prove relative same-origin URLs, exact query enums, JSON body schema, idempotency header, `credentials:"same-origin"`, `cache:"no-store"`, abort propagation, strict response parsing, and fixed secret-free errors.

```ts
test("enable posts only intent with same-origin credentials", async () => {
  const fixture = browserClientFixture(connectionMutationFixture());
  await fixture.api.enable({ idempotencyKey: IDEMPOTENCY_KEY });
  assert.deepEqual(fixture.request, {
    url: "/api/analytics/connection",
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: Object.freeze({ "content-type": "application/json", "idempotency-key": IDEMPOTENCY_KEY }),
    body: '{"intent":"enable"}',
  });
});
```

- [ ] **Step 4: Confirm RED**

```bash
node --experimental-transform-types --test \
  apps/customer-panel/lib/server-analytics/*.test.ts \
  apps/customer-panel/lib/analytics-http/*.test.ts \
  apps/customer-panel/lib/analytics-ui/*.test.ts
```

Expected: missing modules/routes; `0/30` pass.

- [ ] **Step 5: Implement fail-closed runtime composition**

```ts
export async function resolveServerAnalyticsRuntime(
  environment: Readonly<Record<string, string | undefined>>,
): Promise<ServerAnalyticsRuntime | null> {
  const panel = await resolveServerPanelAccessRuntime(environment);
  const provider = await parseUmamiPrivateApiConfig(environment);
  if (!panel || !provider || panel.mode !== "approved_staging") return null;
  return Object.freeze({
    mode: "approved_staging",
    analytics: new PostgresAnalyticsRepository(panel.repositoryOptions),
    umami: new HttpUmamiClient(provider),
    cache: createAnalyticsReadCache({ ttlMs: 30_000, maximumEntries: 128 }),
  });
}
```

Register migration `039` in server-panel preflight without changing `001–038`; a missing checksum/object keeps runtime disabled.

- [ ] **Step 6: Implement exact request authority and handlers**

GET routes accept only exact bounded query keys. POST connection accepts only:

```ts
type ConnectionIntent =
  | Readonly<{ intent: "enable" }>
  | Readonly<{ intent: "disable"; expectedVersion: number }>;
```

The server generates operation/connection/website UUIDs, derives canonical hostname from PostgreSQL, and hashes the operation fingerprint. On uncertain provider create, perform exactly one `getWebsite(websiteId)`; mismatch/absence fails closed and never repeats POST. Repository COMMIT uncertainty uses only read-only recovery. Successful read DTOs use the exact private cache key above for at most 30 seconds; provider/repository errors are never cached; connection mutation invalidates only that private connection key.

- [ ] **Step 7: Implement thin routes and safe browser client**

```ts
export const GET = defaultAnalyticsHandlers.summary.GET;
```

Route files contain no environment parsing, database/provider construction, cookie parsing, hostname authority, or error details. Responses are `no-store`.

- [ ] **Step 8: Run GREEN**

```bash
node --experimental-transform-types --test \
  apps/customer-panel/lib/server-analytics/*.test.ts \
  apps/customer-panel/lib/analytics-http/*.test.ts \
  apps/customer-panel/lib/analytics-ui/*.test.ts
npm test --workspace @celebix/customer-panel
npm run typecheck --workspace @celebix/customer-panel
```

Expected: focused `30/30`; customer-panel `342/342`; typecheck PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/customer-panel/app/api/analytics apps/customer-panel/lib/server-analytics \
  apps/customer-panel/lib/analytics-http apps/customer-panel/lib/analytics-ui \
  apps/customer-panel/lib/server-panel-access/postgres-runtime.ts apps/customer-panel/package.json
git commit -m "feat(analytics): expose tenant-safe analytics api"
```

### Task 6: Exact-host storefront tracker and CSP

**Files:**
- Create: `apps/storefront-shared/lib/analytics/{config,config.test,tracker-client,tracker-client.test}.ts`
- Create: `apps/storefront-shared/components/StorefrontAnalyticsTracker.tsx`
- Create: `apps/storefront-shared/components/StorefrontAnalyticsTracker.test.ts`
- Modify: `apps/storefront-shared/lib/default-runtime.ts:1-90`
- Modify: `apps/storefront-shared/lib/page-context.ts:1-60`
- Modify: `apps/storefront-shared/app/layout.tsx:1-40`
- Modify: `apps/storefront-shared/proxy.ts:1-120`
- Modify: `apps/storefront-shared/lib/storefront-app.test.ts` only for genuine tracker/CSP coverage.
- Modify: `apps/storefront-shared/package.json:5-10` to add only the new test globs.

**Interfaces:**

```ts
export type UmamiPublicCollectorConfig = Readonly<{
  mode: "approved_staging";
  trackerScriptUrl: string;
  collectorOrigin: string;
}>;
export type StorefrontAnalyticsTrackerProps = Readonly<{
  websiteId: string;
  hostname: string;
  trackerScriptUrl: string;
  collectorOrigin: string;
  nonce: string;
}>;
export interface SafeUmamiTracker {
  readonly websiteId: string;
  readonly hostname: string;
  track(payload: Readonly<Record<string, unknown>>): void;
}
```

- [ ] **Step 1: Write eighteen failing config/tracker/CSP tests**

Cover default disabled, exact approved staging, canonical HTTPS/public host validation, credentials/query/fragment/port/internal/private denial, exact active canonical host projection, alias/unknown/inactive denial, script attributes, explicit pageview payload, query/hash/referrer-path stripping, no cookies/storage, nonce propagation, exact CSP destinations, no wildcard/`https:`/`unsafe-inline`, and unrelated storefront CSP preservation.

```ts
test("emits one sanitized pageview without browser authority", async () => {
  const payload = await captureUmamiTrack("https://shop.example/products/sku?coupon=secret#reviews");
  assert.deepEqual(payload, {
    website: WEBSITE_ID,
    hostname: "shop.example",
    url: "/products/sku",
    title: "Product",
    referrer: "https://search.example",
  });
});
```

- [ ] **Step 2: Confirm RED**

```bash
node --experimental-transform-types --test \
  apps/storefront-shared/lib/analytics/*.test.ts \
  apps/storefront-shared/components/StorefrontAnalyticsTracker.test.ts
```

Expected: missing modules/component; `0/18` pass.

- [ ] **Step 3: Implement public config and exact-host lookup**

The parser accepts only two public fields and uses injected DNS in tests. `default-runtime.ts` constructs `PostgresPublicAnalyticsRepository` only for approved staging; `page-context.ts` queries PostgreSQL with the already trusted exact storefront hostname and freezes the optional tracker projection.

```ts
export async function resolveStorefrontTracker(
  runtime: PublicStorefrontRuntime,
  hostname: string,
  now: Date,
): Promise<PublicAnalyticsTrackerConfig | null> {
  const result = await runtime.analytics.getTrackerConfig({ hostname: exactHostname(hostname), now: new Date(now) });
  return result === null ? null : freezeTrackerConfig(result);
}
```

- [ ] **Step 4: Render explicit manual tracking**

```tsx
<Script src={trackerScriptUrl} nonce={nonce} data-website-id={websiteId}
  data-host-url={collectorOrigin}
  data-domains={hostname} data-auto-track="false" data-exclude-search="true"
  data-exclude-hash="true" data-do-not-track="true" strategy="afterInteractive" />
```

The first-party client calls `window.umami.track(exactPayload)` only after the script is ready. The explicit object contains only Website ID, exact hostname, pathname, bounded title, and referrer origin, so Umami does not merge automatic screen/language/query fields. It never reads/sends search, hash, cookie, storage, form values, identity, cart contents, order/customer IDs, or `TenantContext`.

- [ ] **Step 5: Extend CSP from server-owned config**

For only an active exact-host tracker, add exact script origin to `script-src` and collector origin to `connect-src`, preserving nonce/`strict-dynamic` and all existing directives. Never trust request authority or use wildcard, broad `https:`, or `unsafe-inline`.

```ts
const analyticsCsp = tracker === null
  ? Object.freeze({ script: "", connect: "'none'" })
  : Object.freeze({ script: ` ${tracker.scriptOrigin}`, connect: tracker.collectorOrigin });
const defaultCsp = `default-src 'none'; script-src 'nonce-${nonce}' 'strict-dynamic'${analyticsCsp.script}; style-src 'self' 'unsafe-inline'; img-src 'self' data: ${mediaOrigin}; font-src 'self' data:; base-uri 'none'; frame-ancestors 'none'; form-action 'none'; object-src 'none'; connect-src ${analyticsCsp.connect}`;
```

The existing `style-src 'unsafe-inline'` is preserved byte-for-byte for unrelated storefront styling; analytics never adds it to `script-src` or broadens any provider destination.

- [ ] **Step 6: Run GREEN**

```bash
node --experimental-transform-types --test \
  apps/storefront-shared/lib/analytics/*.test.ts \
  apps/storefront-shared/components/StorefrontAnalyticsTracker.test.ts
npm test --workspace @celebix/storefront-shared
npm run typecheck --workspace @celebix/storefront-shared
npm run build --workspace @celebix/storefront-shared
```

Expected: focused `18/18`; storefront-shared `113/113`; typecheck/build PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/storefront-shared/lib/analytics apps/storefront-shared/components/StorefrontAnalyticsTracker* \
  apps/storefront-shared/lib/default-runtime.ts apps/storefront-shared/lib/page-context.ts \
  apps/storefront-shared/app/layout.tsx apps/storefront-shared/proxy.ts \
  apps/storefront-shared/lib/storefront-app.test.ts apps/storefront-shared/package.json
git commit -m "feat(analytics): collect privacy-safe storefront analytics"
```

### Task 7: Durable commerce events and delivery worker

**Files:**
- Create: `apps/storefront-shared/lib/analytics/{events,events.test,delivery,delivery.test}.ts`
- Create: `apps/storefront-shared/components/StorefrontAnalyticsEvent.tsx`
- Create: `apps/storefront-shared/scripts/deliver-analytics-events.mjs`
- Modify: `apps/storefront-shared/app/products/[slug]/page.tsx:1-end` only at the genuine product-view boundary.
- Modify: `apps/storefront-shared/app/odeme/hizli/page.tsx:1-end` and its existing native form only at genuine action boundaries.
- Modify: `apps/storefront-shared/package.json:5-15`; dependency objects remain unchanged.

**Interfaces:**

```ts
export type PublicCommerceEvent =
  | Readonly<{ name: "product_view"; data: Readonly<{ product: "catalog_item" }> }>
  | Readonly<{ name: "checkout_started"; data: Readonly<{ source: "quick_order" }> }>;
export type AnalyticsDeliveryResult = Readonly<{ claimed: number; delivered: number; retried: number; terminal: number }>;
export type DeliveryDependencies = Readonly<{
  now(): Date;
  fetch: typeof globalThis.fetch;
  userAgent: string;
  timeoutMs: number;
}>;
```

- [ ] **Step 1: Write fourteen failing event/worker tests**

Cover two genuine browser events (`product_view`, `checkout_started`), exact bounded payloads, absent-connection no-op, no invented `add_to_cart` while cart UI is only a disabled placeholder, purchase delivery, exact `/api/send`, concurrency bound, bounded retry/backoff, lease fencing, terminal attempt cap, settlement replay creating no second outbox row, secret-free errors, and aggregate counters.

```ts
test("settled purchase delivery contains only approved aggregate data", async () => {
  const fixture = deliveryFixture(purchaseClaim({ valueCents: 129_00, currency: "TRY", source: "quick_link" }));
  await deliverAnalyticsOutbox(fixture.repository, fixture.collector, fixture.dependencies);
  assert.deepEqual(fixture.sent[0]?.body, {
    type: "event",
    payload: { website: WEBSITE_ID, hostname: HOSTNAME, url: "/checkout/complete", name: "purchase", data: { value: 129, currency: "TRY", source: "quick_link" } },
  });
});
```

- [ ] **Step 2: Confirm RED**

```bash
node --experimental-transform-types --test apps/storefront-shared/lib/analytics/{events,delivery}.test.ts
```

Expected: missing modules; `0/14` pass.

- [ ] **Step 3: Implement truthful browser events only**

Render product view only after a real catalog product resolves. Attach `checkout_started` to the existing native `/api/quick-order/checkout` form without reading or serializing its fields and without blocking navigation. `add_to_cart` remains un-emitted until a genuine cart action exists. Do not fabricate purchase, customer, revenue, or order identifiers in the browser.

```ts
export function trackCommerceEvent(tracker: SafeUmamiTracker, event: PublicCommerceEvent): void {
  tracker.track(Object.freeze({
    website: tracker.websiteId,
    hostname: tracker.hostname,
    url: window.location.pathname,
    name: event.name,
    data: event.data,
  }));
}
```

- [ ] **Step 4: Implement bounded workflow delivery**

```ts
export async function deliverAnalyticsOutbox(
  repository: AnalyticsOutboxRepository,
  collector: UmamiPublicCollectorConfig,
  dependencies: DeliveryDependencies,
): Promise<AnalyticsDeliveryResult> {
  const claims = await repository.claim({ now: dependencies.now(), limit: 25, leaseMs: 30_000 });
  const outcomes = await mapConcurrent(claims, 4, claim => deliverClaim(repository, collector, dependencies, claim));
  return summarizeDeliveryOutcomes(outcomes);
}
```

Provider/network failures use bounded exponential backoff and terminate at the schema attempt cap. This is explicitly at-least-once telemetry delivery because Umami exposes no event idempotency key; never claim exactly-once provider receipt. Durable order settlement itself enqueues only one outbox row and is never changed by analytics delivery.

- [ ] **Step 5: Implement workflow-only CLI**

Parse only approved-staging collector and workflow PostgreSQL config, emit aggregate counters, reject browser/interactive execution, and never log payloads, IDs, credentials, tokens, or database settings.

```js
const result = await deliverAnalyticsOutbox(runtime.repository, runtime.collector, runtime.dependencies);
process.stdout.write(JSON.stringify({
  outcome: "analytics_delivery_complete",
  claimed: result.claimed,
  delivered: result.delivered,
  retried: result.retried,
  terminal: result.terminal,
}) + "\n");
```

- [ ] **Step 6: Run GREEN**

```bash
node --experimental-transform-types --test apps/storefront-shared/lib/analytics/{events,delivery}.test.ts
npm test --workspace @celebix/storefront-shared
npm run typecheck --workspace @celebix/storefront-shared
```

Expected: focused `14/14`; storefront-shared `127/127`; typecheck PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/storefront-shared/lib/analytics apps/storefront-shared/components/StorefrontAnalyticsEvent.tsx \
  apps/storefront-shared/app/products apps/storefront-shared/app/odeme/hizli \
  apps/storefront-shared/scripts/deliver-analytics-events.mjs apps/storefront-shared/package.json
git commit -m "feat(analytics): deliver durable commerce analytics"
```

### Task 8: Truthful dashboard analytics summary

**Files:**
- Modify: `apps/customer-panel/lib/panel-ui/dashboard-model.ts:1-360`
- Modify: `apps/customer-panel/lib/panel-ui/dashboard-model.test.ts:1-end`
- Modify: `apps/customer-panel/components/dashboard/PanelDashboardHomeView.tsx:1-end`
- Modify: `apps/customer-panel/components/dashboard/panel-dashboard.module.css:1-end`
- Modify: `apps/customer-panel/lib/panel-shell.test.ts` only for exact dashboard behavior/source assertions.
- Modify: `tests/saas-phase3/hemenaku-admin-presentation/static-security.test.mjs` only to replace stale exact call-shape assertions.

**Interfaces:**

```ts
export type DashboardAnalyticsAuthority = AuthoritySlice<AnalyticsSummary>;
export async function loadMerchantDashboardSummaries(
  catalog: Readonly<{ getDashboardSummary(): Promise<CatalogDashboardSummary> }>,
  orders: Readonly<{ getDashboardSummary(): Promise<OrderDashboardSummary> }>,
  analytics?: Readonly<{ summary(range: AnalyticsRange): Promise<AnalyticsSummary> }>,
): Promise<readonly [
  PromiseSettledResult<CatalogDashboardSummary>,
  PromiseSettledResult<OrderDashboardSummary>,
  PromiseSettledResult<AnalyticsSummary>,
]>;
export function createMerchantDashboardViewModel(
  chrome: PanelChromeModel,
  catalog: AuthoritySlice<CatalogDashboardSummary>,
  orders?: AuthoritySlice<OrderDashboardSummary>,
  carts?: AuthoritySlice<AbandonedCartSummary>,
  customers?: AuthoritySlice<CustomerSummary>,
  analytics?: AuthoritySlice<AnalyticsSummary>,
): MerchantDashboardViewModel;
```

- [ ] **Step 1: Add eight failing dashboard tests**

Prove real pageview/visitor/active values, server time series, unavailable/disabled/empty/error states, one-source failure isolation, no inference from catalog/orders, no placeholders, and no private IDs/authority in model or markup.

```ts
test("dashboard renders only the validated analytics authority", () => {
  const model = createMerchantDashboardViewModel(CHROME, CATALOG, ORDERS, CARTS, CUSTOMERS, readyAuthority(SUMMARY, SUMMARY.asOf));
  assert.equal(model.analytics.state, "ready");
  assert.equal(model.analytics.value.pageviews, SUMMARY.pageviews);
  assert.equal(JSON.stringify(model).includes(WEBSITE_ID), false);
});
```

- [ ] **Step 2: Confirm RED**

```bash
node --experimental-transform-types --test apps/customer-panel/lib/panel-ui/dashboard-model.test.ts apps/customer-panel/lib/panel-shell.test.ts
```

Expected: new analytics assertions FAIL while existing dashboard tests remain green.

- [ ] **Step 3: Extend the model without breaking older callers**

Use a final optional analytics argument defaulted to `unsupportedAuthority("analytics")`; do not reorder existing arguments. Settle all three APIs independently.

```ts
const [catalog, orders, analytics] = await Promise.allSettled([
  catalogApi.getDashboardSummary(), orderApi.getDashboardSummary(), analyticsApi.summary("30d"),
]);
```

- [ ] **Step 4: Render real summary cards and chart**

Keep Hemenaku shell spacing/colors; label source Umami; show range/as-of; preserve empty/error controls; never synthesize trend, revenue, session, or visitor data. Full `TenantContext` stays server-only.

```tsx
{dashboard.analytics.state === "ready" ? (
  <section aria-labelledby="analytics-summary-title">
    <h2 id="analytics-summary-title">Mağaza analizi</h2>
    <p>Umami · son güncelleme {formatPanelTimestamp(dashboard.analytics.asOf)}</p>
    <AnalyticsSummaryCards summary={dashboard.analytics.value} />
    <AnalyticsSeriesChart summary={dashboard.analytics.value} />
  </section>
) : <AnalyticsAuthorityState authority={dashboard.analytics} />}
```

- [ ] **Step 5: Run GREEN**

```bash
node --experimental-transform-types --test \
  apps/customer-panel/lib/panel-ui/dashboard-model.test.ts apps/customer-panel/lib/panel-shell.test.ts \
  tests/saas-phase3/hemenaku-admin-presentation/static-security.test.mjs
npm test --workspace @celebix/customer-panel
npm run typecheck --workspace @celebix/customer-panel
```

Expected: eight new assertions PASS; customer-panel `350/350`; typecheck PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/customer-panel/lib/panel-ui/dashboard-model* apps/customer-panel/components/dashboard \
  apps/customer-panel/lib/panel-shell.test.ts tests/saas-phase3/hemenaku-admin-presentation/static-security.test.mjs
git commit -m "feat(panel): render real analytics dashboard"
```

### Task 9: Hemenaku-aligned `/analytics` console and navigation

**Files:**
- Create: `apps/customer-panel/app/(panel)/analytics/page.tsx`
- Create: `apps/customer-panel/components/analytics/PanelAnalyticsView.tsx`
- Create: `apps/customer-panel/components/analytics/panel-analytics.module.css`
- Create: `apps/customer-panel/lib/analytics-ui/presentation.ts`
- Create: `apps/customer-panel/lib/analytics-ui/presentation.test.ts`
- Modify: `apps/customer-panel/lib/panel-ui/navigation.ts:1-220`
- Modify: `apps/customer-panel/lib/panel-ui/navigation.test.ts:1-end`
- Modify: `apps/customer-panel/lib/panel-ui/chrome-model.ts:1-90`
- Modify: `apps/customer-panel/lib/panel-ui/chrome-model.test.ts:1-end`
- Modify: `apps/customer-panel/components/panel/PanelShell.tsx:1-30`
- Modify: `apps/customer-panel/components/panel/PanelSidebar.tsx:1-190`
- Modify: `apps/customer-panel/components/panel/PanelNavigation.tsx:1-190`
- Modify: `apps/customer-panel/components/panel/panel-shell.module.css:1-end` only for analytics navigation/console responsive rules.
- Modify: `apps/customer-panel/lib/panel-shell.test.ts` only for exact page/navigation/static assertions.

**Component contract:**

```ts
export type PanelAnalyticsViewProps = Readonly<{
  initialRange?: AnalyticsRange;
  api?: AnalyticsBrowserApi;
}>;
export type AnalyticsPresentationModel = Readonly<{
  state: "loading" | "loaded" | "empty" | "disabled" | "error";
  summary: AnalyticsSummary | null;
  metrics: Readonly<Record<AnalyticsMetricType, AnalyticsMetricResult | null>>;
}>;
```

- [ ] **Step 1: Write twelve failing presentation/navigation tests**

Cover `/analytics` exact active state; `/analytics-evil`, child, encoded, query, and fragment near matches inactive; navigation absent when runtime/entitlement is unavailable and present once when both are true; loading/loaded/empty/disabled/error; 7/30/90-day range selection; stale-request abort; metric tabs; safe labels; retry; and no fake/private/provider data.

```ts
test("does not activate analytics for a near-match path", () => {
  assert.equal(isPanelNavigationPathActive("/analytics-evil", "/analytics"), false);
});
```

- [ ] **Step 2: Confirm RED**

```bash
node --experimental-transform-types --test \
  apps/customer-panel/lib/analytics-ui/presentation.test.ts \
  apps/customer-panel/lib/panel-ui/navigation.test.ts \
  apps/customer-panel/lib/panel-shell.test.ts
```

Expected: missing presentation/page and nav assertions FAIL; `0/12` new assertions pass.

- [ ] **Step 3: Add the real navigation destination**

```ts
const ANALYTICS_ITEM = item("analytics", "Analizler", "/analytics", "analytics");
export function getPanelNavigation(input: Readonly<{ analyticsAvailable: boolean }>): readonly PanelNavigationItem[] {
  return input.analyticsAvailable
    ? Object.freeze([...PANEL_NAVIGATION.slice(0, -1), ANALYTICS_ITEM, PANEL_NAVIGATION.at(-1)!])
    : PANEL_NAVIGATION;
}

// Add this field to the existing validated `createPanelChromeModel` return.
analyticsAvailable: isPlanFeatureEnabled(context.entitlements, "analytics"),

export async function PanelShell(props: PanelShellProps) {
  const entitledModel = props.model ?? createPanelChromeModel(props[SERVER_CONTEXT_PROP]);
  const runtimeAvailable = await resolveDefaultServerAnalyticsRuntime().then(value => value !== null, () => false);
  const model = Object.freeze({
    ...entitledModel,
    analyticsAvailable: entitledModel.analyticsAvailable && runtimeAvailable,
  });
  return <PanelLayoutClient model={model}>{props.children}</PanelLayoutClient>;
}
```

Add `/analytics` to the existing exact-path set so child/near-match paths remain inactive. `getPanelNavigation({analyticsAvailable:false})` omits it; `true` returns exactly one frozen item. `PanelShell` resolves the private runtime server-side, combines it with the current `analytics` entitlement, and adds only a safe `analyticsAvailable` boolean to `PanelChromeModel`; sidebar/navigation receive that boolean. Map only its icon to existing `BarChart3`. No environment field, `TenantContext`, Website ID, store ID, or credential enters the client model.

- [ ] **Step 4: Implement immutable presentation state**

```ts
export async function loadAnalyticsPresentation(
  api: AnalyticsBrowserApi,
  range: AnalyticsRange,
  signal: AbortSignal,
): Promise<AnalyticsPresentationModel> {
  const [summary, ...metrics] = await Promise.all([
    api.summary(range, signal),
    ...ANALYTICS_METRIC_TYPES.map(type => api.metrics(range, type, signal)),
  ]);
  return createLoadedAnalyticsPresentation(summary, metrics);
}
```

Each range change aborts the previous request. One metric failure is rendered locally and does not fabricate or relabel other metrics.

- [ ] **Step 5: Build responsive Hemenaku-aligned UI**

Use existing panel header/card/button tokens, Recharts already present in the workspace, semantic tables, keyboard-operable range controls, visible focus, live-region status, and mobile horizontal containment. The page is a genuine authenticated panel route; it accepts no tenant/store/Website ID props.

```tsx
<PanelPageShell eyebrow="ORTAK ADMIN" title="Analizler">
  <div role="group" aria-label="Analiz tarih aralığı">
    {ANALYTICS_RANGES.map(range => <button key={range} aria-pressed={selectedRange === range} onClick={() => setSelectedRange(range)}>{range}</button>)}
  </div>
  <div aria-live="polite"><AnalyticsPresentation model={model} onRetry={reload} /></div>
</PanelPageShell>
```

- [ ] **Step 6: Run GREEN**

```bash
node --experimental-transform-types --test \
  apps/customer-panel/lib/analytics-ui/presentation.test.ts \
  apps/customer-panel/lib/panel-ui/navigation.test.ts \
  apps/customer-panel/lib/panel-shell.test.ts
npm test --workspace @celebix/customer-panel
npm run typecheck --workspace @celebix/customer-panel
npm run build --workspace @celebix/customer-panel
```

Expected: twelve new assertions PASS; customer-panel `362/362`; typecheck/build PASS.

- [ ] **Step 7: Commit**

```bash
git add 'apps/customer-panel/app/(panel)/analytics' apps/customer-panel/components/analytics \
  apps/customer-panel/lib/analytics-ui apps/customer-panel/lib/panel-ui/navigation* \
  apps/customer-panel/lib/panel-ui/chrome-model* apps/customer-panel/components/panel/PanelShell.tsx \
  apps/customer-panel/components/panel/PanelSidebar.tsx apps/customer-panel/components/panel/PanelNavigation.tsx \
  apps/customer-panel/components/panel/panel-shell.module.css \
  apps/customer-panel/lib/panel-shell.test.ts
git commit -m "feat(panel): add umami analytics console"
```

### Task 10: Cross-layer security, accessibility, and local visual evidence

**Files:**
- Create: `tests/saas-phase3/managed-umami-analytics/in-process.test.mjs`
- Create: `tests/saas-phase3/managed-umami-analytics/static-security.test.mjs`
- Create untracked evidence only under: `.codex-evidence/managed-umami-analytics/**`
- Modify application files from Tasks 1–9 only when a focused test exposes a genuine defect; repair in the task-owning commit before final push, never by weakening this evidence.

- [ ] **Step 1: Write twelve failing in-process integration tests**

Cover exact authenticated connection enable/read/disable; cross-store/browser authority ignored; one provider create; create-unknown recovery; exact-host tracker projection; wrong/alias host denial; dashboard summary; analytics metrics; purchase outbox handoff; provider-down isolation; and connection replay.

```js
test("browser-supplied website authority cannot cross the HTTP boundary", async () => {
  const response = await handlers.connection.POST(request({ intent: "enable", websiteId: ATTACKER_ID }));
  assert.equal(response.status, 400);
  assert.equal(calls.repository, 0);
  assert.equal(calls.provider, 0);
});
```

- [ ] **Step 2: Write twelve failing static-security tests**

Prove private env markers occur only server-side; no browser/RSC credential or `TenantContext` projection; no `/api/admin/**`, Supabase, iframe, legacy Logto admin auth, fake KPI, wildcard analytics CSP, raw query/hash/referrer path, browser store/Website authority, raw event payload logging, old migration change, donor change, or lockfile change.

```js
test("client and route sources contain no private analytics authority", async () => {
  const clientSources = await readClientAndRouteSources();
  for (const source of clientSources) {
    assert.doesNotMatch(source.text, /CELEBIX_UMAMI_(?:USERNAME|PASSWORD)|TenantContext|postgres(?:ql)?:|providerBody|sessionId|distinctId/);
  }
});
```

- [ ] **Step 3: Confirm evidence RED, then GREEN without weakening assertions**

```bash
node --experimental-transform-types --test tests/saas-phase3/managed-umami-analytics/in-process.test.mjs
node --experimental-transform-types --test tests/saas-phase3/managed-umami-analytics/static-security.test.mjs
npm run test:saas-phase3:current
```

Expected before final wiring: focused failures identify missing/incorrect boundaries. Expected after repairs: integration `12/12`; static `12/12`; Phase 3 current `59/59` (baseline `47` plus these twelve in-process tests).

- [ ] **Step 4: Verify donor and migration immutability**

```bash
test "$(git rev-parse fc6c5318b47f045a7cefcedc7612d5b10563ba32^{commit})" = fc6c5318b47f045a7cefcedc7612d5b10563ba32
git diff --quiet 912df940d2f8aa1e4d43a076621ad592751f4f04...HEAD -- apps/admin
test -z "$(git diff --name-only 912df940d2f8aa1e4d43a076621ad592751f4f04...HEAD -- apps/owner/scripts/sql/saas | rg '2026072600(0[1-9]|[12][0-9]|3[0-8])_')"
git diff --quiet 912df940d2f8aa1e4d43a076621ad592751f4f04...HEAD -- package-lock.json
```

Expected: donor resolves; `apps/admin/**` diff `0`; migrations `001–038` diff `0`; lockfile diff `0`.

- [ ] **Step 5: Run local accessibility and responsive browser matrix**

Start the authenticated local customer-panel using only disposable local fixtures. Capture untracked screenshots for dashboard loaded/empty/error and analytics loaded/empty/error at:

| Viewport | Expected shell |
|---|---|
| `1440×1000` | desktop sidebar/header |
| `1025×768` | desktop boundary |
| `1024×768` | mobile boundary |
| `390×844` | mobile drawer/dock |
| `320×720` | narrow mobile |

For each state/viewport measure horizontal overflow `0`; targets at least `48×48px`; primary CTA contrast `>=4.5:1`; visible keyboard focus; semantic chart/table labels; drawer focus restoration; dock/form overlap `0`; reduced-motion duration approximately `0.01ms`; console/runtime errors `0`. Store no credential/cookie/token in evidence.

```js
await browser.emulateMedia({ reducedMotion: "reduce" });
const measurements = await browser.evaluate(() => ({
  overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  minimumTarget: Math.min(...[...document.querySelectorAll("a,button,input,select")]
    .map(node => node.getBoundingClientRect()).filter(rect => rect.width > 0 && rect.height > 0)
    .map(rect => Math.min(rect.width, rect.height))),
  reducedMotion: getComputedStyle(document.querySelector('[data-panel-motion="drawer"]')).transitionDuration,
}));
assert.equal(measurements.overflow, 0);
assert.ok(measurements.minimumTarget >= 48);
assert.equal(measurements.reducedMotion, "0.00001s");
```

- [ ] **Step 6: Run forbidden-data scans**

```bash
git diff --check
test -z "$(git diff --name-only 912df940d2f8aa1e4d43a076621ad592751f4f04...HEAD | rg '(^|/)[.]env($|[.])|credential|secret')"
rg -n --glob '!*.test.*' --glob '!*.md' \
  '(postgres(ql)?://[^[:space:]]+:[^[:space:]@]+@|Authorization:[[:space:]]*Bearer[[:space:]]+[A-Za-z0-9]|NEXT_PUBLIC_.*UMAMI_(PASSWORD|USERNAME)|tenantContext.*use client)' \
  apps/customer-panel apps/storefront-shared packages/saas-contracts packages/saas-data && exit 1 || true
git diff 912df940d2f8aa1e4d43a076621ad592751f4f04...HEAD -- \
  apps/customer-panel apps/storefront-shared packages/saas-contracts packages/saas-data \
  ':(exclude)**/*.test.ts' ':(exclude)**/*.test.tsx' | \
  rg -n '^\+.*(iframe|/api/admin/|@supabase|script-src[^;]*unsafe-inline|connect-src[^;]*(\*|https:))' && exit 1 || true
```

Expected: `git diff --check` PASS; credential-bearing filenames `0`; application-source secret/forbidden authority matches `0`. Negative-test strings are excluded only by the explicit test glob and remain asserted by `static-security.test.mjs`.

- [ ] **Step 7: Commit evidence tests only**

```bash
git add tests/saas-phase3/managed-umami-analytics/in-process.test.mjs \
  tests/saas-phase3/managed-umami-analytics/static-security.test.mjs
git commit -m "test(analytics): complete analytics security evidence"
```

Screenshots and browser traces remain untracked.

### Task 11: Whole-branch verification and code-complete handoff

**Files:**
- Modify: none unless a failure reveals a genuine in-scope defect.
- Inspect: all changed files, manifests, test outputs, untracked evidence, branch history, and remote parity.

- [ ] **Step 1: Install exactly from the unchanged lockfile**

```bash
npm ci
node --version
npm --version
```

Expected: `npm ci` PASS; no lockfile edit or unrelated dependency churn.

- [ ] **Step 2: Run complete unit/in-process matrix with exact totals**

```bash
npm test --workspace @celebix/saas-contracts
npm test --workspace @celebix/saas-data
npm test --workspace @celebix/customer-panel
npm test --workspace @celebix/storefront-shared
npm run test:saas-phase3:current
node --experimental-transform-types --test tests/saas-phase3/managed-umami-analytics/static-security.test.mjs
```

Expected: contracts `100/100`; data `224/224`; customer-panel `362/362`; storefront-shared `127/127`; Phase 3 current `59/59`; analytics static `12/12`.

- [ ] **Step 3: Run disposable PostgreSQL and cleanup proof**

```bash
node tests/saas-phase3/managed-umami-analytics/postgres-harness.mjs
```

Expected: PostgreSQL 16, migrations `001–039`, `50/50 PASS`, backup/restore and rollback/reapply PASS, external/production connections `0`, cleanup PASS. If Docker/Podman is absent, use isolated native PostgreSQL 16; do not install infrastructure in this task.

- [ ] **Step 4: Run typecheck, build, and Owner regressions**

```bash
npm run typecheck --workspace @celebix/saas-contracts
npm run typecheck --workspace @celebix/saas-data
npm run typecheck --workspace @celebix/customer-panel
npm run typecheck --workspace @celebix/storefront-shared
npm run typecheck --workspace @celebix/owner
npm run build --workspace @celebix/customer-panel
npm run build --workspace @celebix/storefront-shared
npm run build --workspace @celebix/owner
```

Expected: every command PASS. Owner has no workspace test script, so its regression evidence is typecheck/build plus Phase 3/PostgreSQL consumers; do not invent a test total.

- [ ] **Step 5: Review every changed hunk against the spec**

```bash
git diff --stat 912df940d2f8aa1e4d43a076621ad592751f4f04...HEAD
git diff --name-only 912df940d2f8aa1e4d43a076621ad592751f4f04...HEAD
git log --reverse --oneline 912df940d2f8aa1e4d43a076621ad592751f4f04..HEAD
git status --short
git diff --check
```

Review checklist: every requirement has code and positive/negative tests; no placeholder, deferred marker, or fake metric; every interface consumer/producer compiles; every mutation has idempotency and unknown-outcome semantics; every browser surface is tenant-authority-free; task commits match Tasks 1–10 and are independently reviewable.

- [ ] **Step 6: Push normally and prove parity**

```bash
git push -u origin codex/celebix-managed-umami-analytics
test "$(git rev-parse HEAD)" = "$(git rev-parse origin/codex/celebix-managed-umami-analytics)"
```

Expected: non-force push succeeds; local/remote SHA exact; worktree clean. Report `PASS — MANAGED_UMAMI_ANALYTICS_CODE_COMPLETE`, explicitly stating staging deploy `0`, production impact `0`, merge `0`, credential mutation `0`. Do not claim live phase completion.

### Task 12: Separately authorized isolated staging gate — do not execute yet

**Files:**
- Source/config changes: none authorized by this plan.
- Evidence: untracked `.codex-evidence/managed-umami-analytics/staging/**` only after separate written authorization.

- [ ] **Step 1: Stop and request explicit authorization**

Do not provision, rotate, deploy, connect externally, or create an Umami account/site until Atlas separately authorizes exact services, SHA, disposable identity/store/data limits, credentials, and cleanup.

- [ ] **Step 2: Provision only the authorized isolated stack**

After authorization, pin official self-hosted Umami `v3.1.0` to an exact image digest, use separate staging PostgreSQL, rotate staging-only secrets, and deploy customer-panel/storefront/worker from the exact approved SHA. Owner/production remain untouched unless separately named.

- [ ] **Step 3: Complete genuine browser and durable evidence**

With one disposable staging merchant/store: enable analytics through the authenticated panel; prove one Website ID and exact verified domain; visit storefront paths with query/hash and confirm sanitized capture; exercise genuine product/quick-order action and one completed disposable order; run worker; verify dashboard and `/analytics` real totals; prove alias/wrong host, cross-store, wrong Origin, invalid idempotency, provider-down, replay, and logout denial; scan DOM/RSC/network/console/runtime logs/database rows for forbidden secrets and raw identifiers.

- [ ] **Step 4: Revoke and clean up**

Disable the connection, revoke disposable credentials, remove disposable store/order/product and isolated Umami staging data according to the authorization, verify no production access/mutation, and retain only redacted/untracked evidence.

- [ ] **Step 5: Report the live gate**

Only if all authorized live checks pass, report `PASS — MANAGED_UMAMI_ANALYTICS_STAGING_COMPLETE`; otherwise report the exact blocker without source changes. Shipping integration remains a separate design/implementation phase after this gate.

## Plan self-review

- [x] Every approved design section maps to at least one task and both positive and negative evidence.
- [x] All application-facing interfaces identify producer and consumer; browser DTOs contain no private authority.
- [x] Test totals are computed from verified baselines (`92`, `206`, `288`, `95`, `47`) plus explicit new tests.
- [x] No task modifies `apps/admin/**`, migrations `001–038`, `package-lock.json`, production, infrastructure, credentials, or unsupported navigation.
- [x] No placeholder, fake KPI, second write after unknown outcome, provider secret exposure, or browser tenant/store selection remains.
- [x] Task 12 is visibly separate and blocked on new written authorization.
