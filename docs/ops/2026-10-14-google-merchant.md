# Google Merchant shared release — 2026-10-14

## Delivered architecture
- Shared Customer Panel: `/marketplaces/google-merchant` and authenticated, no-store Marketplace endpoints.
- Merchant API v1, tenant-owned source `Celebix <store UUID>`, TR/tr, validated claimed canonical homepage.
- Native migrations 230/231, forced RLS, tenant authority for reads/mutations; private workflow role for delivery leases.
- Worker runs in the NET panel only with runtime flag `CELEBIX_GOOGLE_MERCHANT_WORKER_ENABLED=true`; SITE has false. Native leases also fence concurrency. It starts through Next instrumentation, with two in-flight offers maximum, no Google work in catalog/order transactions, idle check every 60 seconds.
- Variant query landing and offer-specific structured data in all shared storefront themes.

## Product behavior
- Apply queues current catalog directly. Changed products coalesce; identical exported payloads skip transmission. Scheduled price boundaries drain bounded indexed batches.
- Actual submission refreshes within 25 days. Google processing is distinct from approval; normal pending review does not consume error retries.
- Explicit variant export toggle and manufacturer identifier/color/size/material/gender/age editor. Internal barcodes and fabricated identifiers are not exported.
- Changed/removed/disabled/ineligible offers withdraw only the stable input in this store’s own API source. Disconnect stops queued work; Google-side account/feed administration remains in Merchant Center.
- Continuously indexed currency/gold offers are excluded; export requires a fixed TRY offer matching the live landing price.

## External setup requirements
- Existing Google OAuth client needs Merchant `https://www.googleapis.com/auth/content` scope and required Google consent verification.
- Merchant API must be enabled and Google’s DeveloperRegistration completed once for the OAuth Cloud project. Errors appear as actionable configuration failures. This release does not claim Google registration/approval or create live tenant accounts.
- Store owner creates its Merchant account via Google’s official flow, verifies/claims the exact canonical domain, and completes Google business/shipping/return settings. No foreign domain claim takeover.
- Tenant OAuth and Apply are required before transmitting product data. No live product data was sent during implementation checks.

## Focused acceptance evidence
- 49 panel/HTTP/Google/worker checks; 61 data/provider/Google regression checks; 12 storefront/SEO checks passed. Additional narrow setup retry checks passed during implementation.
- Customer Panel and shared storefront TypeScript checks passed.
- Native assertions, authentic projections, lease/read/finish, pending timestamps, stale generation, identical-payload skip, and scheduled price boundary rehearsal passed inside rolled-back transactions.
- Scoped independent review rechecked domain proof, brand/image authority, source/version fencing, authenticated HTTP and variant landing; reported findings corrected.
- Native schema backup: server private directory `/root/celebix-google-merchant-release-20261014/`; migration includes original function backups and down migration.
- Existing Google connection ciphertext/selection rows were fingerprinted before/after compatible migration and preserved.

## Rollout
- Migrations applied atomically before apps. Delivery gate remains paused until both shared storefronts expose variant landing support; root enables the singleton after source/health acceptance. Legacy Google overview retains its original three services unless the new reader opts into Merchant.
- Release metadata preserves owner apps and other settings; only source pins and the two explicit worker flags change.
- Root releases panels NET → SITE then storefronts NET → SITE, verifying each build/runtime before proceeding.
- On delivery incident stop new onboarding; inspect sanitized worker health and native outbox. Do not bypass authorization or silently mark pending products approved.

## Capacity incident during publication
Host root disk filled during the first build. Root reclaimed 12.72 GB reconstructible build cache and 3.18 GB unused image content; database volumes and 8.7 GB backup directory were preserved. Both databases recovered healthy. The stalled owned publication was cancelled and rebuilt. The NET worker strict-environment parser was corrected after live startup validation; its readiness log contains no private data. Remaining free space is checked between publications.

## Final runtime acceptance
All four shared apps published source `b4ece71accb913b576c2c5a6ed641701abda2e7b`; owner apps remained at `4f290ad33f8b921d3184782a10c6ef85350c7be0`. NET worker emitted `google_merchant_worker_ready`. Both storefronts are healthy. Direct HTTPS origin probe of Alpler adizero-boston selected variant `02de2066-59de-5d53-ac25-24ab833b2485` returned exactly one offer at TRY 2600.00, matching native effective price 260000 cents. Delivery singleton activated after this acceptance. Anonymous Merchant API returns 401. No real Merchant account connected and no live product upload claimed. Remaining Google API/developer registration and real account onboarding require account-level acceptance.

## Claimed www homepage correction

- Google platform developer registration for project `130968698835` completed; account list and registration GET returned 200. These are platform prerequisites, not product approval.
- The selected Güzide account claims `https://www.guzidekuyumcu.com`; the native verified canonical storefront is `guzidekuyumcu.com`. Public www responds with a TLS-valid permanent redirect to that canonical root. Strict hostname comparison rejected this working alias.
- Shared setup now permits only a single www/apex difference after a credential-free, DNS-pinned HTTPS HEAD proves an exact 301/308 redirect to the canonical root. All DNS answers must be public; certificate/SNI verification, a combined five-second deadline and a 16 KiB header limit apply. No redirect is followed and no body is read.
- The existing public host resolver rejects another active tenant's hostname before probing and again before finalizing. The canonical native checkpoint remains unchanged. These separate reads do not provide an atomic alias reassignment guarantee; native finalize continues to fence the canonical store/domain.
- No Google website claim is transferred or rewritten. Product links remain canonical; this connection proof does not imply Google's product acceptance or approval. Reference-priced/invalid-identifier products remain excluded.
- Candidate includes the already live `fc30b107` login design. Only NET/SITE panel source is published; schema, storefronts, owner apps, worker and payment/Google settings remain compatible.
- Focused Google/provider/redirect checks and production data/panel TypeScript checks pass. Full data-package typecheck has five pre-existing test-only `admin-login-security/internal.test.ts` fetch typing errors; no production source error is present. The local wrapper build requires payment build metadata; the panel's direct production compile and actual Coolify build are checked separately.
