import { randomUUID } from "node:crypto";

import { PostgresOrderEmailWorkflowRepository } from "@celebix/saas-data";
import pg from "pg";

import { parseOrderEmailConfig } from "./config.ts";
import { createOrderEmailWebhookHandler } from "./webhook.ts";

const { Pool } = pg;
const SINGLETON = Symbol.for("celebix.owner.order-email-webhook");
const TIMEOUTS = Object.freeze({ poolCheckoutMs: 2_000, statementMs: 5_000, lockMs: 2_000, idleTransactionMs: 5_000 });

type Root = typeof globalThis & { [SINGLETON]?: (request: Request) => Promise<Response> };

export async function getDefaultOrderEmailWebhookHandler(): Promise<(request: Request) => Promise<Response>> {
  const root = globalThis as Root;
  if (root[SINGLETON]) return root[SINGLETON];
  const config = parseOrderEmailConfig(process.env);
  const pool = new Pool({ connectionString: config.database.url, max: 2, connectionTimeoutMillis: TIMEOUTS.poolCheckoutMs, idleTimeoutMillis: 10_000, application_name: "celebix-order-email-webhook" });
  pool.on("error", () => undefined);
  const repository = new PostgresOrderEmailWorkflowRepository({ pool, role: "celebix_saas_workflow", timeouts: TIMEOUTS, uuid: randomUUID });
  const handler = createOrderEmailWebhookHandler({ secret: config.webhookSecret, repository, now: () => new Date() });
  root[SINGLETON] = handler;
  return handler;
}

