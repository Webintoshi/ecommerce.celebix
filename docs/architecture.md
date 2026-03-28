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

### Admin

Magazalarin operasyon panelidir.

## Veri Modeli

Bu baslangicta coklu tenant veritabani yerine ayri proje mantigi kullanilir.

- `Deri Kordon` -> ayri Supabase
- `baska marka` -> ayri Supabase
