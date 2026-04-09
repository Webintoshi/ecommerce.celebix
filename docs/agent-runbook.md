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

Bir store icin dogru bilgiler su kaynaklardan okunur:

1. `stores/<slug>/store.config.json`
2. owner DB:
   - `owner_stores`
   - `owner_store_secrets`
3. canli runtime health endpointleri

Tek basina `.env` authoritative degildir.

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
5. Self-hosted Supabase provisioning denenir
6. R2 bucket provisioning denenir
7. Admin deployment blueprint hazirlanir
8. Admin deployment Coolify uzerinden create/update edilir
9. Storefront scaffold olusturulur
10. Scaffold dosyalari GitHub'a sync edilmeye calisilir
11. Storefront deployment blueprint hazirlanir
12. Storefront deployment Coolify uzerinden create/update edilir
13. Runtime health sonradan owner health ekranindan izlenir

Onemli:

- Store create request'i artik runtime'in ayaga kalkmasini bloklayarak beklememelidir.
- Runtime consistency asenkron health/consistency ekranindan izlenir.

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

Bu dokuman yeni degisiklik geldikce guncellenmelidir.
