import type { QueryResult } from "pg";

import { SaaSDataPersistenceError, SaaSDataPoolTimeoutError, mapPostgresError } from "./errors.ts";

export interface PostgresClientLike {
  query(text: string, values?: unknown[]): Promise<QueryResult<Record<string, unknown>>>;
  release(destroy?: boolean | Error): void;
}

export interface PostgresPoolLike {
  connect(): Promise<PostgresClientLike>;
}

export interface PostgresTimeoutOptions {
  poolCheckoutMs: number;
  statementMs: number;
  lockMs: number;
  idleTransactionMs: number;
}

function checkoutTimeout(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > 60_000) throw new SaaSDataPersistenceError();
  return value;
}

export async function acquirePostgresClient(
  pool: PostgresPoolLike,
  poolCheckoutMs: number,
): Promise<PostgresClientLike> {
  const deadlineMs = checkoutTimeout(poolCheckoutMs);
  const connection = Promise.resolve().then(() => pool.connect());
  let adapterTimedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      adapterTimedOut = true;
      reject(new SaaSDataPoolTimeoutError());
    }, deadlineMs);
  });

  try {
    return await Promise.race([connection, deadline]);
  } catch (error) {
    if (adapterTimedOut) {
      void connection
        .then((lateClient) => lateClient.release(true))
        .catch(() => undefined);
      throw new SaaSDataPoolTimeoutError();
    }
    throw mapPostgresError(error);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
