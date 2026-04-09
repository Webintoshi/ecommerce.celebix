# Magaza Acilis Akisi

## Guncel Akis

1. Owner panel veya CLI ile yeni magaza kaydi acilir
2. `stores/<slug>/store.config.json` olusur
3. `stores/registry.json` guncellenir
4. `stores/<slug>/admin.env.example` olusur
5. Self-hosted Supabase provisioning denenir
6. R2 bucket provisioning denenir
7. Admin deployment blueprint hazirlanir
8. Admin deployment Coolify uzerinden create/update edilir
9. `apps/storefront-base` uzerinden storefront scaffold edilir
10. Storefront scaffold dosyalari GitHub repo'ya sync edilmeye calisilir
11. Storefront deployment blueprint hazirlanir
12. Storefront deployment Coolify uzerinden create/update edilir
13. Runtime consistency owner health ekraninda izlenir

## Onemli Notlar

- Store create request'i runtime ayaga kalkana kadar bloklamamalidir.
- Admin/storefront deployment runtime smoke test'i owner create request'i disinda izlenir.
- Supabase icin musteri domaini degil stock host kullanilir.
- Yeni store theme baslangici `apps/storefront-base` uzerinden gelir.
