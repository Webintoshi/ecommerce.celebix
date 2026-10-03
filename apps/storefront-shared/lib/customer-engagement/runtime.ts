import { randomUUID } from "node:crypto";
import pg from "pg";
import { PostgresRestockWorkerRepository, PostgresReviewCollectionRepository, createReviewCollectionWorker } from "@celebix/saas-data";
import { parseCheckoutRuntimeConfig } from "../checkout/config.ts";
import { runRestockNotificationBatch } from "../restock/worker.ts";
import { createCustomerEngagementEmailSender, parseCustomerEngagementEmailConfig } from "./email.ts";

type RestockResult = Awaited<ReturnType<typeof runRestockNotificationBatch>>;
type ReviewResult = "empty" | "processed" | "failed";
export function createCustomerEngagementTick(jobs: Readonly<{ reviews(): Promise<ReviewResult>; restock(): Promise<RestockResult> }>) {
  return async () => {
    const [reviews, restock] = await Promise.allSettled([jobs.reviews(), jobs.restock()]);
    return Object.freeze({ reviews: reviews.status === "fulfilled" ? reviews.value : "failed" as const, restock: restock.status === "fulfilled" ? restock.value : null });
  };
}

const TIMEOUTS = Object.freeze({ poolCheckoutMs: 2000, statementMs: 5000, lockMs: 2000, idleTransactionMs: 5000 });
export async function initializeCustomerEngagementWorker() {
  const email = parseCustomerEngagementEmailConfig(process.env);
  if (!email) throw Error("engagement_worker_unconfigured");
  const config = parseCheckoutRuntimeConfig(process.env);
  const pool = new pg.Pool({ connectionString: config.database.url, max: 4, connectionTimeoutMillis: 2000, idleTimeoutMillis: 10_000, application_name: "celebix-customer-engagement" });
  pool.on("error", () => undefined);
  try {
    const preflight = await pool.query(`SELECT current_database() AS database_name,
      role.rolsuper AS is_superuser,
      pg_has_role(current_user,'celebix_saas_workflow','MEMBER') AS workflow_member,
      to_regprocedure('saas.review_collection_work_claim(timestamptz,uuid)') IS NOT NULL
      AND to_regprocedure('saas.review_collection_work_seal(uuid,uuid,timestamptz,text,jsonb)') IS NOT NULL
      AND to_regprocedure('saas.review_collection_work_finish(uuid,uuid,timestamptz,text,text)') IS NOT NULL
      AND to_regprocedure('saas.restock_claim(timestamptz,text,integer)') IS NOT NULL
      AND to_regprocedure('saas.restock_authorize(uuid,uuid,text,timestamptz)') IS NOT NULL
      AND to_regprocedure('saas.restock_finish(uuid,uuid,text,timestamptz,text,text)') IS NOT NULL AS ready
      FROM pg_roles role WHERE role.rolname=current_user`);
    const row = preflight.rows[0];
    if (preflight.rowCount !== 1 || row?.database_name !== config.database.name || row?.is_superuser !== false || row?.workflow_member !== true || row?.ready !== true) throw Error("engagement_worker_readiness_failed");
    const send = createCustomerEngagementEmailSender({ ...email, fetch: request => fetch(request), timeoutMs: 5000 });
    const now = () => new Date(), workerId = `engagement-${randomUUID()}`;
    const reviewRepository = new PostgresReviewCollectionRepository({ pool, role: "celebix_saas_workflow", timeouts: TIMEOUTS });
    const restockRepository = new PostgresRestockWorkerRepository({ pool, role: "celebix_saas_workflow", timeouts: TIMEOUTS });
    const reviews = createReviewCollectionWorker({ repository: reviewRepository, now, send });
    return Object.freeze({
      tick: createCustomerEngagementTick({ reviews: reviews.runOnce, restock: () => runRestockNotificationBatch(restockRepository, { now, workerId, send: async message => {
        const result = await send(message, message.idempotencyKey);
        return result.kind === "accepted" ? { kind: "accepted" as const } : { kind: result.kind === "permanent" ? "failed" as const : "retryable" as const, code: result.code };
      } }) }),
      close: () => pool.end(),
    });
  } catch (error) { await pool.end().catch(() => undefined); throw error; }
}
