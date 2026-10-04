import { createHash } from "node:crypto";
import { acquirePostgresClient, type PostgresPoolLike, type PostgresClientLike } from "./pool.ts";

/** Stable intermediate key; the caller's key is reserved for the final native effect. */
export function nativeStepId(operationId: string, step: string): string {
  const digest = createHash("sha256").update(`celebix.atomic.v1:${operationId}:${step}`).digest("hex");
  return `${digest.slice(0,8)}-${digest.slice(8,12)}-4${digest.slice(13,16)}-${((parseInt(digest[16]!,16)&3)|8).toString(16)}${digest.slice(17,20)}-${digest.slice(20,32)}`;
}

/** Compose existing native repository methods without allowing intermediate commits. */
export async function atomicNativeWrite<T>(options: Readonly<{
  pool: PostgresPoolLike; poolCheckoutMs: number; onUnknown(): void;
  recover(observed: T): Promise<T>;
}>, run: (pool: PostgresPoolLike) => Promise<T>): Promise<T> {
  const client = await acquirePostgresClient(options.pool, options.poolCheckoutMs);
  let began = false, terminal = false, closed = false, aborted = false;
  const scoped: PostgresClientLike = {
    async query(text: string, values?: unknown[]) {
      if (closed) throw new Error("atomic_connection_closed");
      if(aborted)throw new Error("atomic_transaction_aborted");
      if(text==="ROLLBACK")aborted=true;
      if (/^BEGIN(?:\s|$)/.test(text) || text === "COMMIT" || text === "ROLLBACK") return { rows: [], rowCount: 0, command: "", oid: 0, fields: [] };
      return client.query(text, values);
    },
    release() { /* Only the outer boundary owns this connection. */ },
  };
  const pool: PostgresPoolLike = { async connect() { if (closed) throw new Error("atomic_connection_closed"); return scoped; } };
  try {
    await client.query("BEGIN ISOLATION LEVEL READ COMMITTED"); began = true;
    const observed = await run(pool); if(aborted)throw new Error("atomic_transaction_aborted"); closed = true;
    try { await client.query("COMMIT"); terminal = true; try { client.release(); } catch { /* confirmed commit */ } return observed; }
    catch { terminal = true; try { client.release(true); } catch { /* terminal */ } try { options.onUnknown(); } catch { /* observational */ } return await options.recover(observed); }
  } catch (error) {
    closed = true;
    if (!terminal) {
      let destroy = !began;
      if (began) try { await client.query("ROLLBACK"); } catch { destroy = true; }
      try { client.release(destroy || undefined); } catch { /* terminal */ }
    }
    throw error;
  }
}
