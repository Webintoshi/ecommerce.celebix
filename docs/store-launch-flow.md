# Magaza Acilis Akisi

## Resmi Source Of Truth

Yeni store provisioning icin authority katmanlari su siradadir:

1. owner DB
   - operational truth
   - provisioning state machine
2. `deploy/owner`
   - file-backed store authority
3. `deploy/storefront/<slug>`
   - store-specific storefront deploy input
4. live infra
   - recovery ve drift tespiti icin gozlemsel kaynak
5. `main`
   - runtime-created store'lar icin source-of-truth degildir

## Stabilize Edilmis Akis

1. Owner panel veya CLI yeni store kaydini acar
2. `stores/<slug>/store.config.json` ve `stores/registry.json` authority branch icin yazilir
3. `stores/<slug>/admin.env.example` olusturulur
4. Owner DB ilk authority snapshot ile senkronlanir
5. Self-hosted Supabase provisioning tamamlanir
6. R2 provisioning tamamlanir
7. Admin deployment blueprint hazirlanir
8. Admin deployment Coolify uzerinden create/update edilir
9. `apps/storefront-base` uzerinden `apps/storefront-<slug>` scaffold edilir
10. Storefront scaffold sonrasi kalici dogrulama yapilir:
    - `apps/storefront-<slug>` var mi
    - `package.json` var mi
    - package name `@celebix/storefront-<slug>` ile uyusuyor mu
    - `storefront.appDir` owner DB + file authority + metadata tarafina yazildi mi
11. Store authority sync `deploy/owner` branch'ine gider
12. Storefront repo sync yalniz `deploy/storefront/<slug>` branch'ine gider
13. Exact branch dogrulamasi calisir:
    - target branch var mi
    - `stores/<slug>/store.config.json` target branch icinde var mi
    - `apps/storefront-<slug>/package.json` target branch icinde var mi
    - package ve `appDir` authority ile uyusuyor mu
14. Bu kontroller gecmeden storefront deployment blueprint hazir sayilmaz
15. Coolify storefront app create/update ancak exact branch dogrulamasi sonrasi dusunulur
16. Runtime consistency owner health ekraninda izlenir

## Kalici Kurallar

- `deploy/owner` ve `deploy/storefront/<slug>` branch'leri farkli sorumluluk tasir; birbirine karistirilmaz.
- Stale file config owner DB veya live state'i downgrade edemez.
- `storefront_app_dir` bir kez dolduktan sonra explicit cleanup olmadan bosaltilemez.
- `metadata.storefront.appDir` varsa ve DB kolonu bossa bu bir recovery sinyalidir; gizlenmez.
- Build-server default yeni store create sirasinda degil, storefront branch/app/package zinciri yesil olduktan sonra eklenir.

## Repair Kurali

Repair calismadan once authority preflight zorunludur:

- owner DB
- `deploy/owner` file authority
- live admin/storefront resources
- Supabase state
- R2 state
- GitHub target branch
- `appDir` / package dogrulamasi

Bu preflight fail ise repair baslamaz.

## DeryCraft 2 Sinifi Ariza

Asagidaki desen artik "yarim basari" sayilmaz ve acik failure reason ile durdurulur:

- Supabase hazir
- R2 hazir
- admin deploy hazir
- ama `storefront.appDir` yok
- ya da `deploy/storefront/<slug>` branch yok
- ya da target branch icinde `apps/storefront-<slug>/package.json` yok

Bu durumda provisioning state success gibi gorunmez; repo sync veya deployment adimi acik hata ile bloke olur.
