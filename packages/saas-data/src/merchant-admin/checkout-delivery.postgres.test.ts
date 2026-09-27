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
  await t.test("rollback cannot cross validation/persistence for either UPDATE or INSERT", async () => {
    const migrationUrl = new URL("../../../../apps/owner/scripts/sql/saas/202609270169_checkout_delivery_days", import.meta.url);
    const [up, down] = await Promise.all([".up.sql", ".down.sql"].map((suffix) => readFile(new URL(`${migrationUrl.href}${suffix}`), "utf8")));
    const writer = await pool.connect(), rollback = await pool.connect();
    // This private QA-only copy exercises the installed save function, pausing
    // immediately after config validation and before any record table access.
    // The installed starter/category wrappers delegate shipping saves to this
    // original implementation. Instrument the actual validation/persist seam.
    const sourceName = "saas.merchant_admin_save_without_category_showcase";
    const source = (await writer.query("SELECT pg_get_functiondef($1::regprocedure) AS definition", [`${sourceName}(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text,text,jsonb,text)`])).rows[0].definition as string;
    const seam = source.match(/\w+:=saas\.merchant_admin_authority_error\(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_kind,true\);/)?.[0];
    assert.ok(seam);
    assert.equal(source.split(seam).length, 2);
    const marker = "celebix-task5-validation-persist-race";
    const instrumented = source.replace(`CREATE OR REPLACE FUNCTION ${sourceName}(`, "CREATE FUNCTION saas.task5_paused_merchant_admin_save(").replace(seam,
      `PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('${marker}',0)); PERFORM pg_catalog.pg_sleep(1); ${seam}`);
    const identity = "saas.task5_paused_merchant_admin_save(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text,text,jsonb,text)";
    let save: Promise<unknown> | undefined, restore: Promise<{ok:boolean;message?:string}> | undefined;
    try {
      await writer.query(`BEGIN; SET LOCAL ROLE celebix_saas_owner; ${instrumented}; REVOKE ALL ON FUNCTION ${identity} FROM PUBLIC; GRANT EXECUTE ON FUNCTION ${identity} TO celebix_saas_app; COMMIT;`);
      for (const mode of ["update", "insert"] as const) {
        const row = mode === "update" ? owner : other;
        const recordId = mode === "update" ? active.id : randomUUID();
        const current = await rollback.query("SELECT version FROM saas.merchant_admin_records WHERE store_id=$1 AND id=$2", [row.storeId, recordId]);
        const writerPid = (await writer.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
        await writer.query("BEGIN; SET LOCAL ROLE celebix_saas_app; SET LOCAL statement_timeout='10s'; SET LOCAL lock_timeout='8s'");
        save = writer.query("SELECT outcome FROM saas.task5_paused_merchant_admin_save($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid,$9::text,$10::uuid,$11::bigint,'shipping_setting','Synthetic rollback race',$12::jsonb,'active')", [row.storeId,row.principalId,row.membershipId,planId,planCode,planVersion,new Date(),randomUUID(),"a".repeat(64),recordId,current.rows[0]?.version ?? null,JSON.stringify({shippingPriceCents:1489,estimatedDays:365})]).then(async (result) => {
          assert.equal(result.rows[0].outcome, "saved");
          await writer.query("COMMIT");
        });
        // Observe the seam rather than relying on sleep in the test process.
        let atSeam = false;
        for (let attempt=0; attempt<100 && !atSeam; attempt++) {
          atSeam = (await rollback.query("SELECT EXISTS(SELECT 1 FROM pg_locks WHERE pid=$1 AND locktype='advisory' AND granted AND classid=((hashtextextended($2,0)>>32)&4294967295)::oid AND objid=(hashtextextended($2,0)&4294967295)::oid) AS held", [writerPid,marker])).rows[0].held;
          if (!atSeam) await new Promise((resolve) => setTimeout(resolve, 5));
        }
        assert.equal(atSeam,true,"the actual save must be paused after validation");
        assert.equal((await rollback.query("SELECT EXISTS(SELECT 1 FROM pg_locks WHERE pid=$1 AND locktype='advisory' AND mode='ShareLock' AND granted) AS held",[writerPid])).rows[0].held,true,"validation must hold a shared transaction fence before any persistence");
        restore = rollback.query(down).then(() => ({ok:true}), (error: Error) => ({ok:false,message:error.message}));
        await save;
        const result = await restore;
        await rollback.query("ROLLBACK");
        // Restore the migration after a red run so the disposable DB remains usable.
        if (result.ok) await rollback.query(up);
        await rollback.query("UPDATE saas.merchant_admin_records SET config=$3::jsonb WHERE store_id=$1 AND id=$2", [row.storeId,recordId,JSON.stringify({shippingPriceCents:1489,estimatedDays:1})]);
        assert.deepEqual(result,{ok:false,message:"CHECKOUT_DELIVERY_DAYS_DOWN_INCOMPATIBLE_RECORD"},`${mode}: rollback must wait for the validator transaction and then reject its incompatible persisted setting`);
      }
      for (const mode of ["update","insert"] as const) {
        const recordId=mode==="update"?active.id:randomUUID();
        const current=await rollback.query("SELECT version FROM saas.merchant_admin_records WHERE store_id=$1 AND id=$2",[owner.storeId,recordId]);
        const downPid=(await rollback.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
        // Pause rollback after its relation lock but before the compatibility
        // snapshot. A writer then arrives at the exact reported interleaving.
        restore=rollback.query(down.replace("DO $rollback$","SELECT pg_catalog.pg_sleep(1);\nDO $rollback$")).then(()=>({ok:true}),(error:Error)=>({ok:false,message:error.message}));
        let downLocked=false;
        for(let attempt=0;attempt<100&&!downLocked;attempt++){
          downLocked=(await writer.query("SELECT EXISTS(SELECT 1 FROM pg_locks WHERE pid=$1 AND relation='saas.merchant_admin_records'::regclass AND mode='ShareRowExclusiveLock' AND granted) AS held",[downPid])).rows[0].held;
          if(!downLocked)await new Promise(resolve=>setTimeout(resolve,5));
        }
        assert.equal(downLocked,true);
        await writer.query("BEGIN; SET LOCAL ROLE celebix_saas_app; SET LOCAL statement_timeout='10s'; SET LOCAL lock_timeout='8s'");
        const attempt=await writer.query("SELECT outcome FROM saas.merchant_admin_save($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid,$9::text,$10::uuid,$11::bigint,'shipping_setting','Synthetic rollback race',$12::jsonb,'active')",[owner.storeId,owner.principalId,owner.membershipId,planId,planCode,planVersion,new Date(),randomUUID(),"b".repeat(64),recordId,current.rows[0]?.version??null,JSON.stringify({shippingPriceCents:1489,estimatedDays:365})]).then(result=>({outcome:result.rows[0].outcome as string}),()=>({outcome:"rejected"}));
        if(attempt.outcome==="saved")await writer.query("COMMIT");else await writer.query("ROLLBACK");
        const restored=await restore;await rollback.query("ROLLBACK");
        assert.deepEqual(restored,{ok:true});
        const incompatible=(await rollback.query("SELECT count(*)::integer AS count FROM saas.merchant_admin_records WHERE store_id=$1 AND config->>'estimatedDays'='365'",[owner.storeId])).rows[0].count;
        const preserved=(await rollback.query("SELECT saas.storefront_shipping_projection($1::uuid) AS shipping",[owner.storeId])).rows[0].shipping;
        await rollback.query(up);
        // Preserve only this synthetic fixture even on a deliberately red run.
        await rollback.query("UPDATE saas.merchant_admin_records SET config=$2::jsonb WHERE store_id=$1 AND name='Synthetic rollback race'",[owner.storeId,JSON.stringify({shippingPriceCents:1489,estimatedDays:1})]);
        assert.notEqual(attempt.outcome,"saved",`${mode}: a writer waiting behind rollback must not commit a formerly valid 365-day config (incompatible=${incompatible}, preserved=${JSON.stringify(preserved)})`);
        assert.equal(incompatible,0);assert.deepEqual(preserved,{shippingCents:1489,estimatedDays:1});
      }
    } finally {
      await save?.catch(() => undefined); await restore?.catch(() => undefined);
      await writer.query("ROLLBACK"); await rollback.query("ROLLBACK");
      await rollback.query("UPDATE saas.merchant_admin_records SET config=$2::jsonb WHERE store_id=ANY($1::uuid[]) AND record_kind='shipping_setting'",[[owner.storeId,other.storeId],JSON.stringify({shippingPriceCents:1489,estimatedDays:1})]);
      await rollback.query(`DROP FUNCTION IF EXISTS ${identity}`);
      writer.release(); rollback.release();
    }
  });
  await t.test("a committed new fee with lost response replays once with unchanged payload",async()=>{
    let lost=false;
    const interruptedPool={async connect(){const client=await pool.connect();return {async query(text:string,values?:unknown[]){
      if(text.includes("merchant_admin_recover_operation"))throw new Error("synthetic_recovery_transport_lost");
      const result=await client.query(text,values);
      if(text==="COMMIT"&&!lost){lost=true;throw new Error("synthetic_commit_response_lost");}
      return result;
    },release(destroy?:boolean){client.release(destroy);}};}};
    const interrupted=new PostgresMerchantAdminRepository({pool:interruptedPool,role:"celebix_saas_app",timeouts:{poolCheckoutMs:2000,statementMs:5000,lockMs:1000,idleTransactionMs:5000},uuid:randomUUID,audit:()=>undefined});
    const intent={tenantContext:tenant(),now:new Date(),operationId:randomUUID(),kind:"shipping_setting" as const,name:"Synthetic lost create response",config:{shippingPriceCents:1489,estimatedDays:2},status:"draft" as const};
    await assert.rejects(()=>interrupted.save(intent),isError("unavailable"));assert.equal(lost,true);
    const before=await load();assert.equal(before.filter(row=>row.name===intent.name).length,1);
    const replay=await repo.save({...intent,now:new Date()});assert.equal(replay.replayed,true);
    const after=await load();assert.equal(after.filter(row=>row.name===intent.name).length,1);
    assert.equal(after.find(row=>row.name===intent.name)?.id,replay.id);assert.equal(after.find(row=>row.name===intent.name)?.version,1);
    await assert.rejects(()=>repo.save({...intent,now:new Date(),config:{shippingPriceCents:2500}}),isError("operation_mismatch"));
  });
  const readOnly=await pool.connect();
  try{await readOnly.query("BEGIN READ ONLY");assert.deepEqual((await readOnly.query("SELECT saas.storefront_shipping_projection($1::uuid) AS shipping",[owner.storeId])).rows[0].shipping,{shippingCents:1489,estimatedDays:1});await readOnly.query("COMMIT");}
  finally{await readOnly.query("ROLLBACK");readOnly.release();}
  // Immutable operation/audit evidence intentionally remains in the task-owned disposable DB.
});
