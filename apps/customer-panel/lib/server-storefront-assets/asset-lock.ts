import type { Pool } from "pg";

export type StorefrontAssetLock = <T>(storeId: string, assetId: string, run: () => Promise<T>) => Promise<T>;

export function createStorefrontAssetLock(pool: Pick<Pool, "connect">): StorefrontAssetLock {
  return async (storeId, assetId, run) => {
    const client = await pool.connect();
    let connectionError: Error | undefined;
    const onError = (error: Error) => { connectionError = error; };
    client.on("error", onError);
    let reusable = false;
    try {
      await client.query("BEGIN");
      try {
        await client.query("SELECT pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended($1::text, 0))", [
          `celebix.panel.storefront-asset:${storeId}:${assetId}`,
        ]);
        const result = await run();
        if (connectionError) throw connectionError;
        return result;
      } finally {
        await client.query("ROLLBACK");
        reusable = !connectionError;
      }
    } finally {
      client.off("error", onError);
      client.release(!reusable);
    }
  };
}
