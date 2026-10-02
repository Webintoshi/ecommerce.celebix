import pg from "pg";
import { PostgresCatalogSearchJobRepository, createMeilisearchCatalogSearchIndexer, runCatalogSearchWorkerOnce } from "@celebix/saas-data";
import { parseCheckoutRuntimeConfig } from "./checkout/config.ts";
import { parseCatalogSearchConfig } from "./catalog-search-config.ts";

export async function initializeCatalogSearchWorker() {
  const search = parseCatalogSearchConfig(process.env, "worker");
  if (!search) throw new Error("catalog_search_worker_disabled");
  const config = parseCheckoutRuntimeConfig(process.env);
  const pool = new pg.Pool({ connectionString: config.database.url, max: 3, connectionTimeoutMillis: 2000, idleTimeoutMillis: 10000, application_name: "celebix-catalog-search-worker" });
  pool.on("error", () => undefined);
  try {
    const result = await pool.query("SELECT current_database() AS database_name,role.rolsuper AS is_superuser,pg_has_role(current_user,'celebix_saas_workflow','MEMBER') AS workflow_member,to_regprocedure('saas.catalog_search_claim(timestamptz,integer,uuid)') IS NOT NULL AND to_regprocedure('saas.catalog_search_ack(uuid,uuid,uuid,bigint,timestamptz,text)') IS NOT NULL AS ready FROM pg_roles role WHERE role.rolname=current_user");
    const row = result.rows[0];
    if (result.rowCount !== 1 || row.database_name !== config.database.name || row.is_superuser !== false || row.workflow_member !== true || row.ready !== true) throw new Error("catalog_search_worker_readiness_failed");
    const repository = new PostgresCatalogSearchJobRepository({ pool, role: "celebix_saas_workflow", timeouts: { poolCheckoutMs: 2000, statementMs: 5000, lockMs: 2000, idleTransactionMs: 5000 } });
    const requeue = () => repository.requeueAll({ now: new Date() });
    const indexer = createMeilisearchCatalogSearchIndexer({ ...search, queryTimeoutMs: 3000, taskTimeoutMs: 10000, onIndexCreated: async () => { await requeue(); } });
    // Heal any ambiguous task accepted before a process/network loss using current DB documents.
    let nextReconciliation = Date.now() + 30 * 60_000;
    return { tick: async () => {
      if (Date.now() >= nextReconciliation) {
        await indexer.ensureReady(); await requeue(); nextReconciliation = Date.now() + 30 * 60_000;
      }
      return runCatalogSearchWorkerOnce({ repository, indexer, limit: 20 });
    }, close: () => pool.end() };
  } catch (error) { await pool.end().catch(() => undefined); throw error; }
}
