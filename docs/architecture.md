# Mimari

## Neden Bu Yapi

Amac, tek magazali projeleri tek tek kopyalamak yerine ortak bir Celebix Panel cekirdegi olusturmaktir.

Bu baslangicta su model kullanilir:

- ortak admin kodu
- ortak commerce core
- her magaza icin ayri Supabase
- mevcut storefront yapilarini sonradan tasiyip marka bazli ozellestirmek
- merkezi owner panel

## Uygulamalar

### Owner

Platform sahibinin kullandigi kontrol panelidir.

- store authority
- provisioning
- health / consistency kontrolu
- admin ve storefront deployment orkestrasyonu

### Admin

Magazalarin operasyon panelidir.

- ortak kod tabani
- merkezi tek DB degil
- store bazli deployment/env modeli

## Veri Modeli

Bu baslangicta coklu tenant veritabani yerine ayri proje mantigi kullanilir.

- `Deri Kordon` -> ayri Supabase
- `baska marka` -> ayri Supabase

## Guncel Altyapi Notlari

- her store icin ayri self-hosted Supabase
- owner icin ayri self-hosted Supabase
- shared Redis
- ortak premium starter theme kaynagi: `apps/storefront-base`
- yeni store'lar Derycraft'i kopyalayarak degil, `storefront-base` scaffold ederek acilir
