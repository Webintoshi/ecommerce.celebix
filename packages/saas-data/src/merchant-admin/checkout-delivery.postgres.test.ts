import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import pg from "pg";
import type { TenantContext } from "@celebix/saas-contracts";
import { MerchantAdminRepositoryError, PostgresMerchantAdminRepository } from "./index.ts";

const connectionString = process.env.CELEBIX_DELIVERY_QA_DATABASE_URL;
const DATABASE = "onboarding_delivery_qa_20260927";
const COMMENT = "celebix-task-owned-disposable-onboarding-20260927";

test("PG16 delivery save/load preserves authority and projects exact checkout cents", { skip: !connectionString }, async (t) => {
  // This gate may write only synthetic fixtures in the explicitly authorized disposable DB.
  const url = new URL(connectionString!);
  assert.equal(url.hostname, "127.0.0.1");
  assert.equal(url.port, "56417");
  assert.equal(url.pathname, `/${DATABASE}`);
  assert.equal(url.search, "");
  const pool = new pg.Pool({ connectionString, max: 2, connectionTimeoutMillis: 2000 });
  t.after(() => pool.end());
  const guard = await pool.query("SELECT current_database() AS name,current_setting('server_version_num')::integer AS version,shobj_description(oid,'pg_database') AS comment FROM pg_database WHERE datname=current_database()");
  assert.equal(guard.rows[0]?.name, DATABASE);
  assert.equal(Math.floor(guard.rows[0]?.version / 10000), 16);
  assert.equal(guard.rows[0]?.comment, COMMENT);

  const now = new Date();
  const validFrom = new Date(now.getTime() - 60000);
  // Plan feature rows are immutable, including INSERT. Reuse the migrated public pilot
  // plan as reference data; never disable its authority guards or change restored data.
  const plan = await pool.query("SELECT p.id,p.plan_code,p.version,p.valid_from FROM saas.plans p JOIN saas.plan_features f ON f.plan_id=p.id AND f.feature_key='catalog' AND f.enabled WHERE p.plan_code='pilot' AND p.version=1 AND p.status='active' AND p.valid_from<=$1 AND (p.valid_until IS NULL OR p.valid_until>$1)", [now]);
  assert.equal(plan.rowCount, 1);
  const { id: planId, plan_code: planCode, version: planVersion, valid_from: planFrom } = plan.rows[0];
  const limits = await pool.query("SELECT limit_key,limit_value FROM saas.plan_limits WHERE plan_id=$1 AND limit_key IN('products','staff','storageBytes')", [planId]);
  const planLimits = Object.fromEntries(limits.rows.map((row) => [row.limit_key, Number(row.limit_value)]));
  assert.equal(limits.rowCount, 3);
  const fixture = () => ({ storeId: randomUUID(), principalId: randomUUID(), membershipId: randomUUID(), slug: `delivery-qa-${randomUUID()}` });
  const owner = fixture(), other = fixture(), analystId = randomUUID(), analystMembership = randomUUID();
  const seed = await pool.connect();
  try {
    await seed.query("BEGIN");
    for (const row of [owner, other]) {
      await seed.query("INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at) VALUES($1,'Synthetic delivery QA',$2,'active','tr','TRY','starter',$3,$3)", [row.storeId, row.slug, validFrom]);
      await seed.query("INSERT INTO saas.principals(id,issuer,subject,email,email_verified,created_at,updated_at) VALUES($1,'https://delivery-qa.invalid/oidc',$2,$3,true,$4,$4)", [row.principalId, row.principalId, `${row.principalId}@delivery-qa.invalid`, validFrom]);
      await seed.query("INSERT INTO saas.memberships(id,principal_id,store_id,role,status,created_at,updated_at) VALUES($1,$2,$3,'store_owner','active',$4,$4)", [row.membershipId, row.principalId, row.storeId, validFrom]);
      await seed.query("INSERT INTO saas.subscriptions(id,store_id,plan_id,plan_code,plan_version,status,valid_from,valid_until,created_at,updated_at) VALUES($1,$2,$3,$4,$5,'active',$6,NULL,$6,$6)", [randomUUID(), row.storeId, planId, planCode, planVersion, validFrom]);
    }
    await seed.query("INSERT INTO saas.principals(id,issuer,subject,email,email_verified,created_at,updated_at) VALUES($1,'https://delivery-qa.invalid/oidc',$2,$3,true,$4,$4)", [analystId, analystId, `${analystId}@delivery-qa.invalid`, validFrom]);
    await seed.query("INSERT INTO saas.memberships(id,principal_id,store_id,role,status,created_at,updated_at) VALUES($1,$2,$3,'analyst','active',$4,$4)", [analystMembership, analystId, owner.storeId, validFrom]);
    await seed.query("COMMIT");
  } catch (error) {
    await seed.query("ROLLBACK");
    throw error;
  } finally { seed.release(); }

  function tenant(row = owner, role: "store_owner" | "analyst" = "store_owner"): TenantContext {
    return {
      schemaVersion: 1, requestId: randomUUID(),
      principal: { id: role === "analyst" ? analystId : row.principalId, issuer: "https://delivery-qa.invalid/oidc", subject: role === "analyst" ? analystId : row.principalId },
      store: { id: row.storeId, slug: row.slug, status: "active" },
      membership: { id: role === "analyst" ? analystMembership : row.membershipId, role, status: "active" },
      entitlements: { schemaVersion: 1, planId, planCode, version: planVersion, status: "active", features: ["catalog"], limits: planLimits, validFrom: planFrom.toISOString() },
      locale: "tr-TR",
    } as TenantContext;
  }
  const repo = new PostgresMerchantAdminRepository({ pool, role: "celebix_saas_app", timeouts: { poolCheckoutMs: 2000, statementMs: 5000, lockMs: 1000, idleTransactionMs: 5000 }, uuid: randomUUID, audit: () => undefined });
  const checkout = async () => (await pool.query("SELECT saas.storefront_shipping_projection($1::uuid) AS shipping", [owner.storeId])).rows[0].shipping;
  const load = () => repo.list({ tenantContext: tenant(), now: new Date(), kind: "shipping_setting" });
  const isError = (code: string) => (error: unknown) => error instanceof MerchantAdminRepositoryError && error.code === code;
  const config = { regions: "Türkiye", freeShippingThresholdCents: 50000, shippingPriceCents: 1489, estimatedDays: 1 };

  const initial = await repo.save({ tenantContext: tenant(), now: new Date(), operationId: randomUUID(), kind: "shipping_setting", name: "Synthetic delivery fee", config, status: "draft" });
  assert.deepEqual((await load())[0].config, config);
  assert.equal(await checkout(), null, "a draft must not become a checkout shipping method");
  const activeInput = { tenantContext: tenant(), now: new Date(), operationId: randomUUID(), kind: "shipping_setting" as const, name: "Synthetic delivery fee", recordId: initial.id, expectedVersion: initial.version, config: { ...config, estimatedDays: 365 }, status: "active" as const };
  const active = await repo.save(activeInput);
  assert.deepEqual(await checkout(), { shippingCents: 1489, estimatedDays: 365 });
  assert.deepEqual((await load())[0].config, activeInput.config);
  const rollback = await pool.connect();
  try {
    const down = await readFile(new URL("../../../../apps/owner/scripts/sql/saas/202609270169_checkout_delivery_days.down.sql", import.meta.url), "utf8");
    await assert.rejects(() => rollback.query(down), (error: unknown) => error instanceof Error && error.message === "CHECKOUT_DELIVERY_DAYS_DOWN_INCOMPATIBLE_RECORD");
  } finally { await rollback.query("ROLLBACK"); rollback.release(); }
  assert.deepEqual(await checkout(), { shippingCents: 1489, estimatedDays: 365 }, "a blocked rollback must preserve the valid new setting");
  assert.equal((await repo.save(activeInput)).replayed, true);
  assert.equal((await load())[0].version, active.version, "an idempotent replay must not increment the record version");

  await assert.rejects(() => repo.save({ ...activeInput, now: new Date(), operationId: randomUUID(), config: { shippingPriceCents: 0 } }), isError("version_conflict"));
  await assert.rejects(() => repo.save({ ...activeInput, tenantContext: tenant(owner, "analyst"), now: new Date(), operationId: randomUUID(), expectedVersion: active.version, config: { shippingPriceCents: 0 } }), isError("membership_denied"));
  assert.deepEqual(await checkout(), { shippingCents: 1489, estimatedDays: 365 });
  assert.deepEqual(await repo.list({ tenantContext: tenant(other), now: new Date(), kind: "shipping_setting" }), []);
  await assert.rejects(() => repo.get({ tenantContext: tenant(other), now: new Date(), kind: "shipping_setting", recordId: active.id }), isError("record_not_found"));

  const free = await repo.save({ ...activeInput, now: new Date(), operationId: randomUUID(), expectedVersion: active.version, config: { ...config, shippingPriceCents: 0 } });
  assert.deepEqual(await checkout(), { shippingCents: 0, estimatedDays: 1 });
  assert.deepEqual((await load())[0].config, { ...config, shippingPriceCents: 0 });
  await repo.save({ ...activeInput, now: new Date(), operationId: randomUUID(), expectedVersion: free.version, config: { ...config, shippingPriceCents: 0 }, status: "draft" });
  assert.equal(await checkout(), null);
  // Immutable operation/audit evidence intentionally remains in the task-owned disposable DB.
});
