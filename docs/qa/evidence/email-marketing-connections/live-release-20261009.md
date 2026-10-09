# Shared email connections — live release

Date: 2026-10-09. Accepted application source: `446557f574ef3d99081f54f2fe138b1fe487a55a`.

**Klaviyo is enabled on both shared Customer Panels. Brevo is visible as preparation pending and remains disabled on the server.** The Brevo registration/key-handling request was sent with explicit user authorization; no reply or approval has been established. Real merchant-key connection, export and provider automation acceptance are not claimed.

The machine-readable [release manifest](live-release-20261009.json) records the acceptance time, six deployment IDs, four runtime restart IDs and evidence digests. Raw configuration snapshots, database backups and diagnostic logs remain private; they are not committed.

## Completed release

1. Fresh snapshot-consistent backup of the existing shared database: 166,504,470 bytes. Restored into an isolated PostgreSQL 16 instance; up → empty down → reapply, rolled-back fixtures and the guarded production transaction passed. The temporary clone was stopped and removed.
2. Native migration **224** applied once under a repeatable-read transaction and advisory lock. All **1,717** existing function definitions/catalogs/ACLs, **339** existing table data sets, schema and role/dependency identities were preserved. Added **19** functions and **9** tables; all seven existing payment preflights passed.
3. Current storefront/owner work was merged before sealing the source. Four release branches were advanced atomically with explicit expected heads. Six application pins and `SOURCE_COMMIT` values were bound to the accepted source.
4. Compatible owners NET→SITE, storefronts NET→SITE and Customer Panels NET→SITE were published in sequence. Each finished deployment passed a scoped check before the next queue operation.
5. All six running applications passed joint source/image, native-reader and protected-configuration acceptance before activation. Klaviyo was enabled; both owners switched from `revoke_only` to `full`. Four official `restart_only` deployments ran owner NET→SITE, then panel NET→SITE.
6. Final acceptance verified all six running images/sources, both panel flags, unique full-mode workers, restricted database roles/TLS, compiled routes/readers, unchanged payment approvals and Google/keyring configuration. No email worker degraded/run-failed marker appeared in the inspected startup logs.

| Target | Running source | Activation |
|---|---|---|
| Owner NET / SITE | `446557f574ef…` | `full`, distinct worker IDs |
| Storefront NET / SITE | `446557f574ef…` | Compatible contact/newsletter readers |
| Customer Panel NET / SITE | `446557f574ef…` | Klaviyo enabled; Brevo disabled |

Opening a page, connecting a provider, customer edits or new consent does not export customers. **Eşitle** creates an explicit finite batch. Existing negative cleanup, uncertain-effect readback and draining remain automatic. Order/contract acceptance does not fabricate marketing consent. Existing and future tenants use the shared feature; each store supplies its own provider account/key.

## Evidence and limits

- Final source production builds passed for Customer Panel, owner and shared storefront. The last provider-gating/recovery pass passed **42/42** scoped email tests, **4/4** explicit isolated native tests and **4/4** shared contract tests; panel/data/contracts type checks passed. Counts are scoped and overlap previous records.
- Independent read-only HTTP smoke observed 21 responses across shared/custom admins, owners and Güzide storefront. Admin/owner login pages were reachable; unauthenticated email APIs returned 401 JSON; no unexpected external redirect appeared. The exact original observation time was not captured and is not invented.
- A separate post-activation check recorded eight timestamped responses: four admin login pages returned 200 HTML and their `/api/marketing/email-connections` endpoints returned 401 JSON without an authenticated session.
- Production container checks confirm code/configuration publication, not a merchant's Google/browser session or provider key behavior. No real merchant key, recipient export, campaign, fake order or financial fixture was used for release acceptance. An authenticated live merchant/provider flow remains outstanding. Earlier responsive UI checks used real local components with synthetic APIs; their boundary remains in the historical records.
- Worker cadence remains five seconds, two global leased jobs and a four-connection pool per owner. Manual export does not imply zero background database queries or a zero-cost performance guarantee.

## Release-control repairs

An initial helper bootstrap name collided with a Laravel function and exited before mutation. A preparation transaction then rejected automatic preview-row creation and rolled back; unchanged pins, zero email flags and an idle queue were confirmed before runtime-only rows were inserted using the narrowly scoped quiet save. These events are retained in private receipts.

The first panel runtime verifier looked for the nonexistent compiled `/api/marketing/email` routes. Actual source and running compiled path inventories established `/api/marketing/email-connections`; only the read-only verifier was corrected. Failed evidence was retained, then the unchanged application passed. A later status observation lacked a receipt; a fresh read-only status confirmation showed the existing deployment finished. No finished deployment or provider write was blindly replayed. Activation occurred only after the corrected six-target acceptance passed.

## Provider status and rollback

Brevo request: sent 2026-10-09, 19:05:36 UTC, to the verified official notice address. Sending a request is not registration or key-model approval. The provider flag remains false until the required process/clarification is resolved. Klaviyo private-key use outside marketplace publication is supported by its official documentation; its optional clarification draft was not sent.

Rollback starts by closing positive exports with `revoke_only` while preserving incoming denials, readback, draining evidence and retained cleanup keys. A populated destructive down remains guarded. The isolated empty rollback was rehearsed; no production down/rollback was performed.

See [operating instructions](../../../ops/email-marketing-connections.md) and [provider request status](../../../ops/email-marketing-provider-approval-requests.md).
