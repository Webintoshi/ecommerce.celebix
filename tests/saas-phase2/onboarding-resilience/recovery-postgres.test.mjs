import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";

import { PostgresSaaSDataRepository, PostgresTenantOperationRecovery } from "@celebix/saas-data";
import { createStarterTenantService } from "@celebix/saas-tenant-core";
import { createOwnerTenantCoreAdapter } from "../../../apps/owner/lib/saas-tenant-core/adapter.ts";
import { createAes256GcmPayloadCipher, createOpaqueStateDigester } from "../../../apps/owner/lib/saas-persistence/identity-crypto.ts";
import { PostgresRegistrationAttemptStore } from "../../../apps/owner/lib/saas-persistence/postgres-registration-attempt-store.ts";
import { IDENTITY_COMPLETION_LEASE_SEED } from "../../../apps/owner/lib/saas-persistence/postgres-identity-common.ts";
import { createPersistentRegistrationCompletionService, createPersistentRegistrationRecoveryService } from "../../../apps/owner/lib/self-serve-registration-completion.ts";

const DATABASE = "onboarding_qa_20260927";
const MARKER = "celebix-task-owned-disposable-onboarding-20260927";
const WORKLOAD = "celebix_onboarding_recovery_qa";
const forbidden = /^(?:PG[A-Z_]*|DATABASE_URL|POSTGRES_URL|SUPABASE.*|OWNER_SUPABASE.*)$/;

function qaConfig(env) {
  if (Object.keys(env).some((key) => forbidden.test(key) && env[key])) throw new Error("External database environment refused");
  if (env.CELEBIX_ONBOARDING_QA_DATABASE !== DATABASE) throw new Error("Explicit task QA database name required");
  if (env.CELEBIX_ONBOARDING_QA_PORT !== "56417") throw new Error("Explicit task QA loopback tunnel required");
  return { host: "127.0.0.1", port: 56417, database: DATABASE, user: "postgres", max: 6, connectionTimeoutMillis: 3000 };
}

test("PostgreSQL recovery harness refuses external URLs, roles and unapproved databases", () => {
  const allowed = { CELEBIX_ONBOARDING_QA_DATABASE: DATABASE, CELEBIX_ONBOARDING_QA_PORT: "56417" };
  assert.equal(qaConfig(allowed).database, DATABASE);
  for (const override of [{ DATABASE_URL: "postgres://example.invalid/live" }, { PGUSER: "live_role" }, { PGHOST: "live.invalid" }, { CELEBIX_ONBOARDING_QA_DATABASE: "postgres" }, { CELEBIX_ONBOARDING_QA_PORT: "5432" }]) {
    assert.throws(() => qaConfig({ ...allowed, ...override }));
  }
});

function gate() {
  let enter, resume;
  return { entered: new Promise((resolve) => { enter = resolve; }), released: new Promise((resolve) => { resume = resolve; }), enter: () => enter(), release: () => resume() };
}

// Gate the real PostgreSQL transport, preserving the repository and service logic.
function gatedPool(pool, { beforeCommit, rollback = false } = {}) {
  return { async connect() {
    const client = await pool.connect();
    return {
      async query(text, values) {
        if (text === "COMMIT" && beforeCommit) {
          beforeCommit.enter();
          // The remote QA tunnel adds latency. Keep the deliberately gated writer
          // active without relaxing the same five-second PostgreSQL limits.
          let released = false;
          void beforeCommit.released.then(() => { released = true; });
          while (!released) {
            await Promise.race([beforeCommit.released, new Promise((resolve) => setTimeout(resolve, 500))]);
            if (!released) await client.query("SELECT 1");
          }
          if (rollback) {
            await client.query("ROLLBACK");
            throw new Error("task QA rollback before commit acknowledgement");
          }
        }
        return client.query(text, values);
      },
      release: (destroy) => client.release(destroy),
    };
  } };
}

const enabled = process.env.CELEBIX_ONBOARDING_QA_DATABASE !== undefined || process.env.CELEBIX_ONBOARDING_QA_PORT !== undefined;
test("PG16 fenced recovery arbitrates old commit, rollback and late writer without duplicate tenant graphs", { skip: !enabled, timeout: 120000 }, async (t) => {
  const config = qaConfig(process.env);
  const admin = new pg.Pool(config);
  const pools = [];
  try {
    const proof = await admin.query("SELECT current_database() AS db, current_setting('server_version_num')::int AS version, shobj_description(oid, 'pg_database') AS marker FROM pg_database WHERE datname=current_database()");
    assert.equal(proof.rows[0]?.db, DATABASE);
    assert.equal(proof.rows[0]?.marker, MARKER, "refuse any database without the task-owned disposable marker");
    assert.ok(proof.rows[0].version >= 160000 && proof.rows[0].version < 170000);
    for (const relation of ["registration_verified_identities", "registration_tenant_completions", "store_media_namespaces", "storefront_designs"]) {
      assert.ok((await admin.query("SELECT to_regclass($1) AS relation", [`saas.${relation}`])).rows[0].relation, `QA schema missing ${relation}`);
    }
    if (!(await admin.query("SELECT 1 FROM pg_roles WHERE rolname=$1", [WORKLOAD])).rowCount) {
      await admin.query(`CREATE ROLE ${WORKLOAD} LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`);
      await admin.query(`GRANT celebix_saas_identity, celebix_saas_bootstrap TO ${WORKLOAD}`);
    }
    const role = (await admin.query("SELECT rolsuper, rolinherit, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls FROM pg_roles WHERE rolname=$1", [WORKLOAD])).rows[0];
    assert.deepEqual(Object.values(role), [false, false, false, false, false, false]);
    function pool(name) {
      const value = new pg.Pool({ ...config, user: WORKLOAD, application_name: `onboarding-recovery-qa-${name}` });
      pools.push(value);
      return value;
    }
    const identityPool = pool("identity");
    const recoveryPool = pool("recovery");
    const cipherKey = randomBytes(32);
    const timeouts = { poolCheckoutMs: 2000, statementMs: 5000, lockMs: 4000, idleTransactionMs: 5000 };
    const origins = { panelOrigin: "https://panel.celebix.site", platformDomainSuffix: "celebix.site" };
    const clock = () => new Date();
    const store = new PostgresRegistrationAttemptStore({
      pool: identityPool,
      stateDigester: createOpaqueStateDigester({ key: randomBytes(32), context: "registration-attempt-state" }),
      payloadCipher: createAes256GcmPayloadCipher({ currentKeyId: "task-qa", resolveKey: () => cipherKey }),
      timeouts, clock, audit() {}, identityRole: "celebix_saas_identity",
    }, origins);
    const recovery = new PostgresTenantOperationRecovery({ pool: recoveryPool, timeouts, bootstrapRole: "celebix_saas_bootstrap", panelOrigin: origins.panelOrigin });
    function core(corePool) {
      return createOwnerTenantCoreAdapter(createStarterTenantService({
        repository: new PostgresSaaSDataRepository({ pool: corePool, timeouts, bootstrapRole: "celebix_saas_bootstrap", panelOrigin: origins.panelOrigin, generateId: () => randomUUID(), audit() {} }),
        platformDomainSuffix: origins.platformDomainSuffix, panelBaseUrl: origins.panelOrigin,
        diagnostic: (stage, failure) => t.diagnostic(`Tenant Core ${stage}: ${failure}`),
      }));
    }
    function services(corePool) {
      const deps = { workflowStore: store, tenantCore: core(corePool), recovery, ...origins, clock, audit() {} };
      return { ordinary: createPersistentRegistrationCompletionService(deps), internal: createPersistentRegistrationRecoveryService(deps) };
    }
    async function prepare(label) {
      const suffix = randomBytes(8).toString("hex");
      const date = new Date();
      const registration = {
        id: `attempt_${suffix}${suffix}`, state: randomBytes(32).toString("base64url"),
        details: { storeName: "Task QA Recovery", storeSlug: `qa-${label}-${suffix}`, locale: "tr", currency: "TRY", themeKey: "starter", privacyAcceptedAt: date.toISOString() },
        idempotencyKey: `ssik_${suffix}${suffix}`, requestedAt: date.toISOString(), createdAt: date.toISOString(), expiresAt: new Date(date.getTime() + 600000).toISOString(), status: "awaiting_identity",
      };
      await store.save(registration);
      await store.consume(registration.state);
      const recorded = await store.recordVerifiedIdentity({ attemptId: registration.id, expectedVersion: 1, now: clock(), identity: { issuer: "https://identity.example.test", subject: `qa-${suffix}`, email: `qa-${suffix}@example.test`, emailVerified: true } });
      const claim = await store.claimTenantCompletion({ attemptId: registration.id, now: clock() });
      assert.equal(claim.kind, "claimed");
      claim.lease.release(); // The old request lost its session lease; its core transaction may still run.
      return recorded.authority;
    }
    async function waitForLock(name) {
      for (let index = 0; index < 100; index++) {
        const row = await admin.query("SELECT 1 FROM pg_stat_activity WHERE datname=$1 AND application_name=$2 AND wait_event_type='Lock'", [DATABASE, `onboarding-recovery-qa-${name}`]);
        if (row.rowCount) return;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      assert.fail("same-key INSERT did not wait for the competing real PostgreSQL transaction");
    }
    async function graph(authority, result) {
      const loaded = await store.loadVerified(authority.attempt.id);
      assert.equal(loaded.completion.state, "completed");
      assert.equal(loaded.completion.recoveryAbsentAt, undefined);
      assert.equal(loaded.completion.tenantOperationId, result.operationId);
      assert.deepEqual(loaded.tenantInput, authority.tenantInput);
      assert.equal(loaded.canonicalFingerprint, authority.canonicalFingerprint);
      const counts = await admin.query(`SELECT
        (SELECT count(*)::int FROM saas.tenant_operations WHERE idempotency_key=$1 AND payload_fingerprint=$2 AND status='committed') AS operations,
        (SELECT count(*)::int FROM saas.stores WHERE slug=$3) AS stores,
        (SELECT count(*)::int FROM saas.memberships WHERE store_id=$4 AND role='store_owner') AS owners,
        (SELECT count(*)::int FROM saas.subscriptions WHERE store_id=$4) AS subscriptions,
        (SELECT count(*)::int FROM saas.domains WHERE store_id=$4) AS domains,
        (SELECT count(*)::int FROM saas.admin_domains WHERE store_id=$4) AS admin_domains,
        (SELECT count(*)::int FROM saas.store_domains WHERE store_id=$4) AS storefront_domains,
        (SELECT count(*)::int FROM saas.store_media_namespaces WHERE store_id=$4) AS media,
        (SELECT count(*)::int FROM saas.storefront_designs WHERE store_id=$4) AS designs`,
      [authority.attempt.idempotencyKey, authority.canonicalFingerprint, authority.tenantInput.store.slug, result.store.id]);
      assert.deepEqual(counts.rows[0], { operations: 1, stores: 1, owners: 1, subscriptions: 1, domains: 1, admin_domains: 1, storefront_domains: 1, media: 1, designs: 1 });
      const persisted = await recovery.recover(authority.attempt.idempotencyKey, authority.canonicalFingerprint);
      assert.equal(persisted.kind, "committed_match");
      assert.equal(persisted.result.operationId, result.operationId);
    }

    for (const action of ["commit", "rollback", "late"]) {
      await t.test(action, async () => {
        const authority = await prepare(action);
        const oldPool = pool(`old-${action}`);
        const retryPool = pool(`retry-${action}`);
        const oldCommit = gate();
        const retryCommit = gate();
        const oldCore = core(action === "late" ? oldPool : gatedPool(oldPool, { beforeCommit: oldCommit, rollback: action === "rollback" }));
        const retry = services(action === "late" ? gatedPool(retryPool, { beforeCommit: retryCommit }) : retryPool);
        let old, resumed;
        try {
          if (action !== "late") {
            old = oldCore.createStarterTenant(authority.tenantInput);
            await Promise.race([oldCommit.entered, old.then((result) => assert.fail(`old core exited before COMMIT: ${result.ok ? "success" : result.error.code}`))]);
          }
          assert.deepEqual(await retry.ordinary.reconcileUnknownCommit(authority.attempt.id), { kind: "recovery_absent", state: "ready" });
          const fenced = await store.loadVerified(authority.attempt.id);
          assert.ok(fenced.completion.recoveryAbsentAt);
          assert.deepEqual(await retry.ordinary.resumeTenantCreation(authority.attempt.id), { kind: "reconciliation_required" });
          resumed = retry.internal.resumeRecoveredTenantCreation(authority.attempt.id);
          if (action === "late") {
            await Promise.race([retryCommit.entered, resumed.then((result) => assert.fail(`retry exited before COMMIT: ${result.kind}`))]);
            old = oldCore.createStarterTenant(authority.tenantInput);
            await waitForLock(`old-${action}`);
            retryCommit.release();
          } else {
            await waitForLock(`retry-${action}`);
            const creating = await store.loadVerified(authority.attempt.id);
            assert.equal(creating.completion.recoveryAbsentAt, fenced.completion.recoveryAbsentAt);
            assert.equal(creating.completion.state, "creating");
            oldCommit.release();
          }
          const [oldOutcome, outcome] = await Promise.all([old, resumed]);
          assert.equal(outcome.kind, action === "commit" ? "tenant_replayed" : "tenant_created");
          assert.equal(oldOutcome.ok, action !== "rollback");
          if (oldOutcome.ok) assert.equal(oldOutcome.value.operationId, outcome.result.operationId);
          await graph(authority, outcome.result);
        } finally {
          oldCommit.release(); retryCommit.release();
          await Promise.allSettled([old, resumed].filter(Boolean));
        }
      });
    }

    await t.test("busy lease rolls back immediately; stale versions never claim", async () => {
      const authority = await prepare("busy");
      const standard = services(pool("busy-core"));
      await standard.ordinary.reconcileUnknownCommit(authority.attempt.id);
      const fenced = await store.loadVerified(authority.attempt.id);
      const holder = await recoveryPool.connect();
      try {
        await holder.query("SELECT pg_advisory_lock(hashtextextended($1,$2))", [authority.attempt.id, IDENTITY_COMPLETION_LEASE_SEED]);
        assert.deepEqual(await standard.internal.resumeRecoveredTenantCreation(authority.attempt.id), { kind: "in_progress" });
        const after = await store.loadVerified(authority.attempt.id);
        assert.deepEqual(after.completion, fenced.completion);
        await assert.rejects(store.claimTenantCompletionRecovery({ attemptId: authority.attempt.id, expectedWorkflowVersion: fenced.version, expectedCompletionVersion: fenced.completion.version - 1, now: clock() }), (error) => error.code === "registration_completion_conflict");
      } finally { holder.release(true); }
    });
  } finally {
    await Promise.all(pools.map((pool) => pool.end()));
    await admin.end();
  }
});
