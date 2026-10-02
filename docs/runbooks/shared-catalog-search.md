# Shared catalog search

One private Meilisearch service supplies product search for the two existing shared storefront deployments. Stores created later use these shared runtimes automatically; onboarding creates their hostname and database authority, so it requires no additional search service or per-store search secret.

## Service and source ownership

- Compose source: `infra/search/compose.yaml`.
- Setup and environment reconciliation: `infra/search/setup.py`.
- Private network: existing Docker bridge `coolify`.
- Internal origin: `http://celebix-catalog-search:7700`.
- Persistent volume: `celebix-catalog-search-data`.
- Protected setup state: `/data/celebix/search`, owned by the operator with mode `0700`; its secret files have mode `0600`.
- Shared SITE app: `vtc2aah63jbqnmtxmvykn6jl`.
- Shared NET app: `h55zoba9jh6ij8g6irpqzd9i`.

Both Coolify applications currently build with `npm run build:coolify:storefront-shared`, start `@celebix/storefront-shared`, and use the repository root. The setup command verifies the application UUID and shared build scope before changing anything. New-store provisioning runs through `apps/owner/lib/onboarding-jobs/default.ts`, `PostgresSaaSDataRepository`, and the shared hostname resolver; it does not create a separate application. The legacy generated-store deployment code is not the integration point for shared search.

The engine has no published host port, public domain, proxy labels or Docker socket mount. Its administrative API is reachable from the private Docker network and the server host. The setup command reaches the container's private bridge address and supplies the master key from its protected file; it disables HTTP proxies and rejects redirects. Browser requests reach the storefront, where validated hostname authority supplies the mandatory store filter. Engine keys remain in server runtime configuration.

The engine is pinned to `getmeili/meilisearch:v1.54.3@sha256:e68913ab7d6f5b159529e472cfd362ce3c741fafd3c127961b2142abbe41b3c9`. This stable, non-prerelease version was published on 2026-10-01. The digest was resolved on 2026-10-02 from the official Docker Hub `getmeili/meilisearch` OCI image manifest and covers Linux amd64 and arm64. Sources: [official release](https://github.com/meilisearch/meilisearch/releases/tag/v1.54.3), [official Dockerfile](https://github.com/meilisearch/meilisearch/blob/v1.54.3/Dockerfile), [official registry manifest](https://registry-1.docker.io/v2/getmeili/meilisearch/manifests/v1.54.3).

The service reserves at most two CPUs and 2 GiB RAM, with indexing limited to two threads and 1 GiB memory. The named volume survives container replacement. These limits fit the initial host snapshot; inspect actual usage as catalogs grow.

## Prepare and install

Run this on server `WEBINTOSH` using Python 3.9 or newer and the existing Docker Compose installation. The setup refuses a different hostname, a remote Docker context, a missing `coolify` bridge, a public Coolify endpoint, or an unexpected application scope. It uses the existing Coolify control plane for its encrypted settings and accepts no SaaS database credential.

First review the plan. This command creates no files, contacts no services and makes no changes:

```sh
python3 infra/search/setup.py
```

Install the engine, bootstrap its scoped keys/index, and save the shared application settings:

```sh
python3 infra/search/setup.py --apply \
  --state-dir /data/celebix/search \
  --coolify-local-cli \
  --worker site
```

The local CLI backend runs the existing Coolify Laravel control plane through a captured JSON pipe. It allows only these two application UUIDs and the five search fields. It checks that the global deployment queue is idle, both apps use the shared build/start commands, and automatic/preview deployment flags are off before each write. Changes use a database transaction and encrypted Eloquent attribute casts. Creation observers are suppressed to prevent new preview variables; raw encrypted unrelated/preview rows and application settings are checked for exact preservation. A private `0600` preimage of the five owned settings is saved under the setup state's `history` directory. The transport never prints decrypted variables to the operator.

An optional API backend accepts an existing authorized Coolify API token in an operator-owned `0600` file outside the checkout through `--coolify-token-file`. Its origin is restricted to `http://127.0.0.1:8000`; the token needs sensitive read and write authority. It refuses creation of variables that would cause Coolify to synthesize preview rows, so the local CLI backend is the initial-install path. Setup creates no new API token.

Setup captures Docker/control-plane output privately and prints a redacted summary containing service, image, application UUIDs and changed targets. It never calls an application deployment, start or restart endpoint. After migration rehearsal and verification pass, publish both compatible shared readers, then apply migrations 194/195 atomically. Per-request scope fallback and worker readiness retries allow the database to arrive without a runtime restart. This order keeps the new relevance cursor away from old readers.

The command is safe to repeat. It keeps the existing volume, master key and scoped key UIDs. Existing keys must retain their exact index/action scope. Existing indexes must retain primary key `id`; mismatches stop setup. Settings are updated through asynchronous tasks, whose success is verified. Existing documents are not cleared. If one application's setting update succeeds and another fails, run the same command again; matching settings are skipped and every changed target is read back.

## Environment contract

These five settings are persisted centrally in Coolify with `is_runtime=true`, `is_buildtime=false`, `is_preview=false` and literal values. `is_buildtime` is the actual field in Coolify 4.3.23. Existing unrelated and preview variables remain intact.

| Setting | SITE | NET |
| --- | --- | --- |
| `CELEBIX_SEARCH_URL` | Private internal origin | Same origin |
| `CELEBIX_SEARCH_API_KEY` | Search key | Same search key |
| `CELEBIX_SEARCH_INDEX` | `celebix_products_v1` | Same index |
| `CELEBIX_SEARCH_WORKER_ENABLED` | `true` | `false` |
| `CELEBIX_SEARCH_WRITE_API_KEY` | Write key | Empty |

SITE runs the initial queue worker; both runtimes serve searches. `--worker net`, `--worker both`, or `--worker none` explicitly changes this selection. Only enabled workers receive the write key. Multiple workers require the application's database queue leases, which arbitrate claims centrally. Future tenants automatically use this same index and worker path.

The search key allows only `search` on `celebix_products_v1`. The worker key allows `indexes.get`, `indexes.create`, `settings.update`, `documents.add`, `documents.delete`, and `tasks.get`, scoped to that same index. The engine master key is mounted only in the engine and read by the local bootstrap command. It is never copied into either app's environment. Scoped key values are saved in protected files at creation and reused; the script stops if they cannot be recovered safely. See [official key creation and scope documentation](https://www.meilisearch.com/docs/reference/api/keys/create-api-key).

## Index contract

The shared index has primary key `id`, with documents identified by the store/product composite identifier supplied by the worker. Displayed attributes are only `storeId` and `productId`; published product cards are rehydrated from the authoritative, store-scoped database projection. Searchable attributes are `skus`, `barcodes`, `searchText`, and `title`. Filterable attributes are `storeId`, `skus`, and `barcodes`. SKU and barcode typo tolerance is disabled. There are no sortable attributes. The maximum search window is 10,000 hits.

The service cannot determine tenant authority from a browser-supplied store ID. Every storefront search must enforce its validated host's store ID, and the database rehydration must exclude inactive, deleted or foreign-store products. Search documents are a derived catalog index; prices, stock, discounts and checkout eligibility come from database truth.

## Verify and maintain

The infrastructure checks can be run without credentials or product output:

```sh
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s infra/search -p 'test_*.py' -v
docker port celebix-catalog-search
docker exec celebix-catalog-search curl --fail --silent http://127.0.0.1:7700/health
docker stats --no-stream celebix-catalog-search
```

`docker port` must print nothing. Health must return `status=available`. After the reviewed storefront release, verify both stores' search behavior, Turkish character handling, SKU/barcode exact matches, tenant isolation, queue progress and inactive-product removal through the application's normal verification path.

Back up the named volume and protected setup state together before engine upgrades. Keep backup archives private. Use the engine's authenticated snapshot/dump API for a consistent backup and wait for its task to succeed; do not copy a running LMDB directory as the only backup. Engine version changes require review of the official migration instructions and an explicit image/digest update in this compose file. Reconcile saved application variables with the same setup command after upgrades.

The first catalog migration queues every existing product; later product/store changes use the same outbox triggers automatically. If the engine volume is lost after jobs have already been acknowledged, creating an empty index does not requeue those completed jobs. Use the existing authorized workflow database connection to requeue the persisted document snapshots and tombstones through the supported function, then let the normal worker rebuild the index:

```sql
BEGIN;
SET LOCAL ROLE celebix_saas_workflow;
SELECT outcome,result_payload FROM saas.catalog_search_requeue_all(CURRENT_TIMESTAMP);
COMMIT;
```

This reports only an outcome and count, advances generations, and preserves active worker leases. It requires the workflow role and grants no direct access to catalog tables. Keep the database search fallback available during engine recovery; do not clear catalog or outbox rows to force a rebuild.

To disable indexing while keeping the existing index, rerun setup with `--worker none` and deploy the reviewed application configuration. To remove search credentials from a deployment, remove the five search variables centrally in Coolify and deploy that application release. Preserve the search volume and protected keys for recovery; do not use `docker compose down --volumes` as an ordinary rollback action.
