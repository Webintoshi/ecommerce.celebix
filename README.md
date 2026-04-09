# Celebix Panel

Celebix Panel, birden fazla e-ticaret markasini ortak admin ve ortak commerce core ile yonetmek icin olusturulan monorepo baslangicidir.

## Hedef

- `owner` uygulamasi ile magaza acilisini merkezden yonetmek
- `admin` uygulamasini ortak kod tabani olarak tutmak
- mevcut storefront yapilarini daha sonra kontrollu sekilde bu yapiya tasimak
- her magaza icin ayri Supabase projesi kullanmak

## Klasorler

- `apps/owner`: merkezi owner panel
- `apps/admin`: ortak admin panel cekirdegi
- `packages/platform-config`: store registry ve config erisim katmani
- `stores`: magaza kayitlari ve magaza bazli config dosyalari
- `scripts/create-store.mjs`: yeni magaza iskeleti ureten CLI

## Baslangic Komutlari

```bash
npm install
npm run dev:owner
npm run dev:admin
```

## Admin Env Akisi

Her magaza ayni `apps/admin` kodunu kullanir. Degisen sadece store secimi ve baglandigi servis env'leridir.

1. `stores/<slug>/store.config.json` olustur
2. o magaza icin ayri Supabase project ac
3. `apps/admin/.env.example` dosyasini baz alip ilgili deployment env'lerini gir
4. `STORE_SLUG=<slug>` ile admini baslat

Ornek:

```bash
STORE_SLUG=deri-kordon npm run dev:admin
```

Bu modelde:

- admin ozelligi bir kez gelistirilir
- her magaza ayni admin cekirdegini kullanir
- Supabase, domain ve storage ayri kalir
- veri ve SEO birbirine karismaz

## Yeni Magaza Acma

```bash
npm run create:store -- --name "Yeni Magaza" --slug yeni-magaza --domain yeni-magaza.com --theme leather
```

Owner panel ile acildiginda ek olarak su akisi desteklenir:

1. `stores/<slug>/store.config.json` olusturulur
2. `stores/<slug>/admin.env.example` olusturulur
3. `apps/owner/.env.local` icinde Supabase management token varsa yeni Supabase project acilir
4. admin schema ve secili runtime migration'lari yeni projeye uygulanir
5. `stores/<slug>/admin.env.local` icine gizli baglanti anahtarlari yazilir

Owner bootstrap env dosyasi:

```bash
apps/owner/.env.local
```

Ilk aktif referans:

- `Deri Kordon`

Detaylar:

- [Mimari](./docs/architecture.md)
- [Magaza Acilis Akisi](./docs/store-launch-flow.md)
- [Agent Runbook](./docs/agent-runbook.md)
