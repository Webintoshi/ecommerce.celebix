# Agent Runbook

Bu dokuman, owner provisioning veya store launch akisina dokunan agentlerin yeni standart davranisi bozmadan calisabilmesi icin hazirlanmistir.

## Temel Gercekler

- Owner control plane ortak kodu:
  - `apps/owner`
- Admin ortak uygulama kodu:
  - `apps/admin`
- Yeni storefront starter kaynagi:
  - `apps/storefront-base`
- Authority:
  - `stores/<slug>/store.config.json`
  - `stores/registry.json`
  - owner DB metadata

## Yeni Store Standardi

Yeni store acilisinda varsayilan database mode artik `light_postgres`'tir.

- default:
  - `light_postgres`
- legacy explicit:
  - `full_supabase`
- storage:
  - Cloudflare R2
- deploy:
  - build-server + GHCR authority modeli
- demo domain:
  - `<slug>.demo.celebix.co`

Bir agent yeni store create koduna dokunuyorsa ilk varsayim su olmalidir:

- "Bu store full Supabase degil, light Postgres store-per-database ile acilacak"

## Source Of Truth

Bir store icin authoritative veri kaynaklari:

1. `stores/<slug>/store.config.json`
2. owner DB:
   - `owner_stores`
   - `owner_store_secrets`
3. runtime health endpointleri

Tek basina `.env` authoritative degildir.

## Database Mode Kurallari

### light_postgres

- `databaseMode` verilmezse otomatik secilir.
- Shared cluster:
  - `celebix-light-postgres`
- Database name:
  - `<slug>`
- Minimal schema:
  - `products`
  - `product_variants`
  - `categories`
  - `settings`
  - `pages`

### full_supabase

- Sadece explicit `databaseMode=full_supabase` ile acilir.
- Varsayilan akisi bypass etmez.
- Self-hosted legacy path icin optional sidecar default-off guard zorunludur:
  - `SELF_HOSTED_SUPABASE_DISABLE_STUDIO=true`
  - `SELF_HOSTED_SUPABASE_DISABLE_ANALYTICS=true`
  - `SELF_HOSTED_SUPABASE_DISABLE_VECTOR=true`

## Create Flow

Yeni store create akisinda agent su sirayi beklemelidir:

1. Store kaydi acilir.
2. Authority dosyalari yazilir.
3. `databaseMode` metadata'ya kalici yazilir.
4. Erken persistence alanlari yazilir:
   - `storefront.appDir`
   - `storefront.packageName`
   - `storefront.deploymentBranch`
5. Database provisioning calisir.
6. R2 provisioning calisir.
7. Storefront scaffold olusur.
8. Storefront repo sync exact branch'e gider.
9. Deploy blueprint'leri hazirlanir.
10. Runtime consistency daha sonra owner health ekranindan izlenir.

## Branch ve Deploy Guard

Authority-only commitler deploy tetiklememelidir.

- authority branch:
  - varsayilan `stores/authority`
- storefront deploy branch:
  - `deploy/storefront/<slug>`
- generated admin image:
  - `ghcr.io/celebixco/<slug>-admin:production`
- generated storefront image:
  - `ghcr.io/celebixco/<slug>-storefront:production`
- build server:
  - `celebix-build-01`

Generated app payload'larinda su guard'lar beklenir:

- `use_build_server = true`
- `docker_registry_image_name` dolu
- `docker_registry_image_tag = production`
- `build_server = celebix-build-01`
- `watch_paths` authority-only `stores/**` commitlerini izlemeyecek
- auto deploy default off

## Runtime Guard

Yeni light-postgres runtime modeli artik iki parcadan olusur:

- data/runtime hazirligi:
  - `apps/storefront-base` public read path'leri light-postgres adapter ile calisir
  - `apps/admin` settings/categories/pages/products/product_variants server path'leri ayni adapter ile calisir
  - generated env'lerde Supabase zorunlu degildir
- auth hazirligi:
  - merkezi admin auth yoksa login ve korumali admin endpoint'leri `blocked_auth_setup` ile acikca bloke edilir
  - light-postgres create auth yuzunden sessiz yarim kalmaz

Agent sunu normal kabul etmelidir:

- light-postgres create path authority, branch, DB, R2 ve runtime env modelini hazirlar
- admin/storefront runtime'i veri tarafinda acilabilir
- auth kurulumu daha sonra tamamlanacaksa provisioning `auth_setup = blocked_auth_setup` yazar

## State Kurallari

- Bir provisioning step fail olursa top-level state `running` kalmamalidir.
- Downstream step'ler `blocked` yazilmalidir.
- `lastError` dolu olmalidir.
- Repair akisi `failed` ve `blocked` step'leri yeniden ele alabilmelidir.
- `analytics_setup` ve `auth_setup` step'leri de ayni reducer kurallarina uymalidir.

## Cleanup Standardi

Yeni store cleanup planinda asagidaki authority alanlari hesaba katilmalidir:

- owner DB row ve metadata
- `stores/registry.json`
- `stores/<slug>/store.config.json`
- `stores/<slug>/admin.env.example`
- `storefront.appDir`
- `storefront.deploymentBranch`
- `lightPostgres.databaseName`
- R2 bucket/public URL
- demo domain referansi
- GHCR image adlari

Canli cleanup bu runbook'ta calistirilmaz; burada sadece kapsam tanimlanir.

## Dry-Run Validation

Kod degisikliklerinden sonra agent sunlari kosmalidir:

1. `npm run typecheck --workspace @celebix/owner`
2. `npm run build --workspace @celebix/owner`
3. `npm run typecheck --workspace @celebix/platform-config`
4. `git diff --check`

Ek dry-run senaryolari:

1. default `databaseMode` = `light_postgres`
2. explicit `full_supabase` olmadan legacy path'e girilmiyor
3. full Supabase sidecar guard eksikken preflight fail ediyor
4. storefront exact branch `deploy/storefront/<slug>` olusuyor
5. build-server/GHCR defaults authority'de dolu geliyor
6. admin/storefront generated env'leri Supabase olmadan olusuyor
7. `auth_setup` light-postgres create icin `blocked_auth_setup` yaziyor
8. fail sonrasi kalan step'ler `blocked` yaziliyor

## Pratik Kurallar

- Owner create akisina dokunuyorsan once `apps/owner`, sonra `packages/platform-config` incele.
- `stores/**` authority degisikliklerini deploy trigger'i sanma.
- Yeni storefront davranisi icin once `apps/storefront-base` dusun.
- Yeni store create'i canli ortamda denemeden once dry-run ve disposable smoke planini ayir.
