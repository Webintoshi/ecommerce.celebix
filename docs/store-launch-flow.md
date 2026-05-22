# Magaza Acilis Akisi

## Yeni Varsayilan

Yeni magaza acilis standardi artik `light_postgres` modudur.

- database mode:
  - `light_postgres` varsayilan
  - `full_supabase` sadece explicit legacy secenek
- database:
  - shared cluster `celebix-light-postgres`
  - store-per-database modeli
- storage:
  - Cloudflare R2
- deploy:
  - admin/storefront icin build-server + GHCR authority modeli
- domains:
  - `domains.storefront` gercek domain
  - `domains.admin` gercek admin domain
  - `domains.demo` = `<slug>.demo.celebix.co`

## Create Akisi

1. Owner panel yeni store kaydini acar.
2. `stores/<slug>/store.config.json` yazilir.
3. `stores/registry.json` guncellenir.
4. `stores/<slug>/admin.env.example` uretilir.
5. `databaseMode` authority'ye kalici yazilir.
6. Asagidaki storefront authority alanlari create basinda yazilir:
   - `storefront.appDir = apps/storefront-<slug>`
   - `storefront.packageName = @celebix/storefront-<slug>`
   - `storefront.deploymentBranch = deploy/storefront/<slug>`
7. Light Postgres seciliyse:
   - `celebix-light-postgres` icinde `<slug>` database'i olusturulur
   - minimal storefront schema uygulanir
   - minimal settings + Umami-ready metadata seed edilir
8. R2 provisioning denenir.
9. Storefront scaffold uretilir.
10. Storefront repo sync exact branch'e yazilir.
11. Storefront blueprint hazirlanir.
12. Admin blueprint hazirlanir.
13. Admin/storefront Coolify payload'lari build-server/GHCR varsayilanlariyla hazirlanir.
14. `analytics_setup` step'i Umami-ready metadata'sini dogrular.
15. `auth_setup` step'i light-postgres store icin merkezi admin auth hazir degilse `blocked_auth_setup` yazar.
16. Runtime consistency ayri health ekranindan izlenir.

## Database Mode Kurallari

### light_postgres

- Owner create request'inde `databaseMode` verilmezse otomatik secilir.
- Supabase stack kurulmaz.
- `supabase_preflight` ve `supabase_provision` step isimleri metadata uyumlulugu icin korunur ama anlamsal olarak database preflight/provision gorevi gorur.
- Minimal schema su tablolari garanti eder:
  - `products`
  - `product_variants`
  - `categories`
  - `settings`
  - `pages`
- Schema ayni zamanda yeni admin/storefront runtime'i icin gereken temel kolonlari da yazar:
  - products SEO, gorsel, stok ve besin alanlari
  - variant attributes/images metadata
  - category/page SEO ve icerik metadata'si
- Seed verisi su yuzeyleri bos gelmeyecek sekilde hazirlanir:
  - homepage/page kayitlari
  - `store_info`
  - `analytics`
  - `seo_settings`
  - `announcement_bar`
  - `shipping_options`
  - `variant_attributes_registry`

### full_supabase

- Sadece explicit `databaseMode=full_supabase` ile acilir.
- Legacy path olarak korunur.
- Self-hosted Coolify Supabase icin optional sidecar guard zorunludur:
  - `SELF_HOSTED_SUPABASE_DISABLE_STUDIO=true`
  - `SELF_HOSTED_SUPABASE_DISABLE_ANALYTICS=true`
  - `SELF_HOSTED_SUPABASE_DISABLE_VECTOR=true`
- Guard saglanmadan provisioning baslamaz.

## Build-Server / GHCR Varsayilanlari

Yeni store authority'si varsayilan olarak su alanlari yazar:

- admin:
  - image: `ghcr.io/celebixco/<slug>-admin`
  - tag: `production`
  - `useBuildServer = true`
  - `buildServer = celebix-build-01`
- storefront:
  - image: `ghcr.io/celebixco/<slug>-storefront`
  - tag: `production`
  - `useBuildServer = true`
  - `buildServer = celebix-build-01`

Generated app payload'lari ayrica `watch_paths` ile authority-only `stores/**` commitlerinden ayrilir.

Blueprint hazirlama sirasinda su alanlardan biri eksikse deploy sessizce local build'e dusmez:

- `docker_registry_image_name`
- `docker_registry_image_tag`
- `use_build_server = true`
- `build_server = celebix-build-01`

Bu durumda ilgili deploy step'i `failed` olur ve `lastError` yazilir.

## Deploy Guard

Authority-only commitlerin owner veya musteri runtime'larini tetiklememesi hedeflenir.

- store authority branch:
  - varsayilan `stores/authority`
- storefront repo branch:
  - `deploy/storefront/<slug>`
- generated admin apps:
  - auto deploy default off
  - watch paths `apps/admin/**,packages/**`
- generated storefront apps:
  - auto deploy default off
  - watch paths `apps/storefront-<slug>/**,packages/**`

## State Tutarliligi

- Bir step fail olursa top-level state `running` kalmaz.
- Fail sonrasi downstream step'ler `blocked` yazilir.
- `lastError` her zaman ilk blocking hatayi tasir.
- Repair akisi `failed` ve `blocked` step'leri yeniden calistirabilir.

## Runtime Hazirlik Modeli

Yeni light-postgres store icin runtime beklentisi artik soyledir:

- storefront public read path'leri `DATABASE_MODE=light_postgres` ile light-postgres adapter kullanir
- admin settings/categories/pages/products/product_variants server path'leri ayni adapter ile calisir
- Supabase env'leri light-postgres runtime icin zorunlu degildir
- admin login/auth kurulumu merkezi auth gelene kadar `blocked_auth_setup` olarak acikca bloke edilir

Amac sessiz yarim-kurulum degil, veri/runtime tarafini hazir tutup auth eksigini net state ile gostermektir.

## Cleanup Modeli

Yeni store config'i cleanup icin gereken authority alanlarini tasir:

- owner DB row
- `stores/registry.json`
- `stores/<slug>/store.config.json`
- `stores/<slug>/admin.env.example`
- `storefront.appDir`
- `storefront.deploymentBranch`
- `domains.demo`
- `lightPostgres.databaseName`
- `bootstrap.adminDeployment.image`
- `storefront.deployment.image`
- R2 bucket/public URL authority'si

Canli cleanup bu dokumanda calistirilmaz; sadece hangi yuzeylerin temizlenecegi tanimlidir.

## Dry-Run Checklist

Canli create olmadan dogrulanacak maddeler:

1. `databaseMode` verilmezse `light_postgres` yaziliyor mu?
2. `databaseMode=full_supabase` olmadan legacy path'e girilmiyor mu?
3. Full Supabase sidecar guard eksikken preflight fail ediyor mu?
4. `storefront.appDir`, `packageName`, `deploymentBranch` create basinda yaziliyor mu?
5. Storefront repo sync exact `deploy/storefront/<slug>` branch'ini kullaniyor mu?
6. Admin/storefront blueprint'leri build-server/GHCR varsayilanlarini tasiyor mu?
7. Light-postgres admin/storefront env'leri Supabase olmadan uretiliyor mu?
8. `auth_setup` light-postgres store icin `blocked_auth_setup` yaziyor mu?
9. Fail sonrasi step'ler `blocked` yaziliyor mu?
