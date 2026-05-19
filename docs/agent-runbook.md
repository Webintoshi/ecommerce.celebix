# Agent Runbook

Bu dokuman, Celebix monorepo icinde calisan baska agentlerin owner, admin, storefront ve provisioning akisini dogru kullanabilmesi icin hazirlanmistir.

## Temel Gercekler

- Ortak kod tabani vardir:
  - `apps/owner`
  - `apps/admin`
  - `apps/storefront-base`
- Veri merkezi degildir.
- Her magaza kendi veritabanina gider.
- Owner merkezi kontrol panelidir.
- Admin ortak koddur ama store bazli deployment/env ile calisir.
- Storefront yeni magazalar icin `apps/storefront-base` uzerinden scaffold edilir.

## Dogru Mimari

- `owner`
  - merkezi control plane
  - store authority
  - provisioning ve health
- `admin`
  - ortak admin kodu
  - her store icin ayri deployment/env
  - hedef store'un self-hosted Supabase'ine baglanir
- `storefront`
  - her store icin ayri deployment
  - `apps/storefront-base` premium starter theme kaynagidir
- `supabase`
  - her store icin ayri self-hosted Supabase
  - owner icin ayri self-hosted Supabase
- `redis`
  - shared cache/presence/rate limit katmani
- `r2`
  - medya ve public asset katmani

## Source Of Truth

Bir store icin dogru bilgiler su sirayla okunur:

1. owner DB
   - `owner_stores`
   - provisioning / metadata / secrets authority
2. `deploy/owner`
   - file-backed authority branch
3. `deploy/storefront/<slug>`
   - store-specific storefront deploy input
4. canli runtime health endpointleri
   - recovery ve drift gozlemi icin
5. `main`
   - runtime-created store icin authority degildir

Tek basina `.env` authoritative degildir.

## Branch Modeli

- Owner/admin authority sync:
  - `deploy/owner`
- Storefront code sync:
  - `deploy/storefront/<slug>`
- Development branch:
  - `main` veya ilgili `codex/...` branch'i

Yanlis varsayim:

- "Storefront deploy branch'i global bir branch olabilir"

Dogru varsayim:

- "Her store icin storefront deploy branch'i explicit ve store-specific olmalidir"

## Supabase Kurallari

- Storefront/admin icin gercek domain kullanilir.
- Supabase icin musteri domaini kullanilmaz.
- Self-hosted Supabase stock host ile kullanilir:
  - ornek: `https://supabasekong-<slug>.<ip>.sslip.io`
- Ham `:8000` ve `:8001` URL'leri kullanilmaz.
- Studio icin portsuz clean URL tercih edilir.

## Admin Kurallari

- `apps/admin` tek bir ortak kod tabanidir.
- Bu, tek bir merkezi veritabani kullandigi anlamina gelmez.
- Her store icin admin deployment ayri dusunulur.
- `panel.celebix.co` bugun aktif store admini olabilir; bunu coklu-tenant merkezi admin sanma.

Bir agent asla sunu varsaymamalidir:

- "Tum magazalar tek panel ve tek DB ile yurutuluyor"

Dogru varsayim:

- "Ortak admin kodu var, store bazli deployment/env ve store bazli DB var"

## Owner Create Flow

Yeni proje owner panelden acildiginda hedef akis su sekildedir:

1. Store kaydi acilir
2. `stores/<slug>/store.config.json` yazilir
3. `stores/registry.json` guncellenir
4. `stores/<slug>/admin.env.example` uretilir
5. owner DB authority satiri olusur / guncellenir
6. Self-hosted Supabase provisioning denenir
7. R2 bucket provisioning denenir
8. Admin deployment blueprint hazirlanir
9. Admin deployment Coolify uzerinden create/update edilir
10. Storefront scaffold olusturulur
11. Scaffold sonrasi kalici dogrulama yapilir
12. Store authority `deploy/owner` branch'ine sync edilir
13. Storefront code `deploy/storefront/<slug>` branch'ine sync edilir
14. Exact branch verification gecerse storefront deployment blueprint hazirlanir
15. Storefront deployment Coolify uzerinden create/update edilir
16. Runtime health sonradan owner health ekranindan izlenir

Onemli:

- Store create request'i artik runtime'in ayaga kalkmasini bloklayarak beklememelidir.
- Runtime consistency asenkron health/consistency ekranindan izlenir.
- Storefront deployment, target branch icinde `apps/storefront-<slug>/package.json` dogrulanmadan baslatilmaz.
- `storefront.appDir`, `repoSyncStatus`, `deploymentStatus` file authority ile owner DB'de ayni anda ilerler.

## Repair Preflight

Repair baslamadan once su katmanlar birlikte kontrol edilmelidir:

- owner DB authority
- `deploy/owner` file authority
- live admin/storefront resources
- Supabase readiness
- R2 readiness
- GitHub target branch varligi
- `appDir` / package / deployment branch tutarliligi

Bu preflight fail ise repair durur.

## Theme Standardi

Yeni magazalar sifirdan bos theme ile acilmamalidir.

Dogru yaklasim:

- `apps/storefront-base`
  - premium starter theme
  - Derycraft kalitesine yakin ortak omurga
  - store-specific veri yerine placeholder / generic veri

Bir agent yeni magaza icin Derycraft'i kopyalamamali.

Dogru is:

- `apps/storefront-base` gelistirilir
- yeni store oradan scaffold edilir

## Health Ve Smoke Test

Bir store acildiktan sonra agent su kontrolleri yapmalidir:

### Owner

- `GET /api/stores/<slug>`
- `GET /api/stores/<slug>/consistency`

### Admin

- `POST /api/auth/login`
- `GET /api/public/runtime`
- `GET /api/admin/me`
- `GET /api/settings?type=general`

### Storefront

- `GET /api/public/runtime`
- ana sayfa aciliyor mu
- locale prefix calisiyor mu

### Infra

- store icin tek aktif Supabase service var mi
- admin deployment olusmus mu
- storefront deployment olusmus mu
- R2 bucket/public url var mi

## Sik Yapilan Hatalar

### 1. Supabase icin musteri domaini acmak

Yanlis.

Dogru:

- Supabase stock host ile calisir

### 2. `:8000` adresini Studio sanmak

Yanlis.

Dogru:

- owner metadata'daki clean dashboard URL kullanilir

### 3. `apps/admin`i merkezi multi-tenant admin sanmak

Yanlis.

Dogru:

- ortak kod + store bazli deployment/env

### 4. Store create request'inde canli runtime'i dakikalarca beklemek

Yanlis.

Dogru:

- deploy tetiklenir
- runtime consistency owner health ekranindan takip edilir

### 5. `store.config` ve owner secret drift'ini yok saymak

Yanlis.

Dogru:

- consistency endpoint'i kontrol edilir
- stale file config owner DB'yi downgrade etmemelidir

### 6. Storefront branch'i local scaffold ile karistirmak

Yanlis.

Dogru:

- local `apps/storefront-<slug>` varligi tek basina yeterli degildir
- `deploy/storefront/<slug>` icinde ayni app ve store config dogrulanmalidir

### 7. `lastScaffoldedAt` var ama `appDir` yok durumunu yok saymak

Yanlis.

Dogru:

- bu bir authority/persistence arizasidir
- provisioning veya repair success sayilmaz

## Agent Icin Pratik Kurallar

- Owner/provisioning degisikliklerinde once `apps/owner` sonra `packages/platform-config` kontrol edilir.
- Yeni store automation ile ilgili her is `stores/<slug>/store.config.json` yazimini hesaba katmalidir.
- Storefront theme degisikligi yaparken once `apps/storefront-base` dusunulmelidir.
- Derycraft'a ozel degisiklikler `apps/storefront-deri-kordon` icinde kalmalidir.
- Yeni agent bir store acma veya deploy automation degisikligi yaptiysa mutlaka disposable bir `sslip.io` domain ile smoke test planlamalidir.

## Derycraft Referansi

Derycraft sistemin referans magazasidir ama source-of-truth tema kopyasi degildir.

Dogru kullanim:

- davranis referansi olarak Derycraft
- ortak starter theme kaynagi olarak `apps/storefront-base`

## Bakim Notu

Eger owner create akisi yeni store acarken tekrar timeout vermeye baslarsa ilk bakilacak yerler:

1. `apps/owner/app/api/stores/route.ts`
2. `apps/owner/lib/storefront-scaffold.ts`
3. `apps/owner/lib/storefront-repo-sync.ts`
4. `apps/owner/lib/admin-deployment-coolify.ts`
5. `apps/owner/lib/storefront-deployment-coolify.ts`

Eger vaka DeryCraft 2 benzeri yarim provisioning ise ilk bakilacak yerler:

1. owner DB `storefront_app_dir` / `metadata.storefront`
2. `deploy/owner` store authority
3. `deploy/storefront/<slug>` branch varligi
4. target branch icinde `apps/storefront-<slug>/package.json`
5. exact branch verification sonucu

Bu dokuman yeni degisiklik geldikce guncellenmelidir.
