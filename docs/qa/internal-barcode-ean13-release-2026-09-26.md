# Dahili EAN-13 barkod yayını — 2026-09-26

Durum: iki aktif paylaşılan panelin yayını ve canlı veritabanı geçişi başarılı. Tarayıcıda oturum gerektiren düğme kontrolü giriş bekliyor.

Uygulama kaynağı: `dfb01b773c9e88ff1a1a89eaa1bce26e7a61c876`.
Yayın dalı: `codex/internal-ean13-barcodes`.
Önceki çalışan kaynak: `0a36a6c4d107a7b71d1531dfb920c48ad7011ed8`.

## Kapsam

İki aktif paylaşılan müşteri/admin paneli aynı SaaS veritabanını kullanıyor. Coolify uygulama adlarında ortam etiketi staging; Güzide'nin özel admin alan adları da `.site` uygulamasına bağlı. Kullanıcı tüm bu admin panellerinin yayınını açıkça yetkilendirdi.

Yeni otomatik atamalar rastgele 98/99 başlangıçlı, EAN-13 kontrol hanesi geçerli 13 rakam üretir. Eski 9 haneli üretici kaldırılır. Daha önce ürünlere kaydedilmiş barkodlar silinmez. Bunlar dahili kodlardır; GS1 tarafından tahsis edilmiş ürün GTIN'leri değildir.

## Yedek ve veritabanı kanıtı

- PostgreSQL: 16.14; veritabanı `celebix_saas_staging_auth01`.
- Ön kontrol: 10 mağaza, 1691 varyant, 20 barkod işlemi; yeni kod aralığında ürün/rezervasyon tekrar sayısı 0.
- Sunucudaki tam yedek: `/data/celebix-release-backups/ean13_20260926_052710.dump` (9.355.260 bayt, dosya izinleri 0600).
- SHA-256: `52731f95569a076cb3fc55d5050484d648b88be4f71f7b42a994fd28f21473f1`.
- Tam yedek ayrı deneme veritabanına başarıyla geri yüklendi. Geçiş ve işlem kontrolleri tamamlandıktan sonra yalnız bu geçici kopya kaldırıldı; tam yedek sunucuda korunuyor.
- Denemede 155 up/assertions → 156 up/assertions → 156 down → 155 down başarılı. Eski işlevler geri geldi; yeni işlev/indeksler kaldırıldı; ürün/işlem sayıları değişmedi.
- Canlı 155 up ve assertions başarılı.
- Canlı 156 up/assertions, iki eski uygulama örneği kaldırıldıktan sonra başarılı. Yeni rezervasyon/toplu atama işlevleri ve iki indeks mevcut; eski sayısal rezervasyon/toplu atama işlevleri yok. Ürün/işlem sayıları 1691/20, yeni aralıkta tekrar sayıları 0.

## Uygulama yayınları

| Panel | Coolify UUID | Deployment | Sonuç |
|---|---|---|---|
| Güzide / `.site` | `yk1h6d97z7ex0h74ok3zrj5c` | `g8t15c339u8atj8dn3aejtqh` | Finished; 05:45:26 UTC |
| Siora / `.net` | `e4xe74cmii7jucbkyor0o412` | `oqqktcspaoy776cdxnzetjw4` | Finished; 05:50:37 UTC |

Yayın kaynağı dalı ve sabit commit güncellenir; mevcut yayın öncesi/sonrası işlemler ve otomatik yayın ayarları korunur.

İlk Güzide yayını `b5akdvmp6cuxzo4rradx3n0j` başarılı oldu; image tag ve barkod handler/migration dosya hash'leri yeni kaynağı doğruladı. Ancak kalıcı `SOURCE_COMMIT` ortam değeri önceki sürümde kalmıştı. Son kabul verilmeden sürüm bağlamı düzeltildi ve `g8t15c339u8atj8dn3aejtqh` yeniden yayını başlatıldı.

Son Güzide container: `3799271558b4`, `yk1h6d97z7ex0h74ok3zrj5c-054049888885`; image `sha256:e6f9a0d1d42ba78f61222d372c1f6b58b3f21c8b9f853143d86bd39d6610ac1b`. Runtime `SOURCE_COMMIT` ve üretilmiş ödeme metadata SHA'ları exact yayın kaynağına eşit. Eski `17265af2958a` container kaldırıldı; sağlık HTTP 200, `status=ok`, Redis `ready`.

Son Siora container: `767b2ac31402`, `e4xe74cmii7jucbkyor0o412-054606900187`; image `sha256:bcca184a3e941a330057d70d36f8db2a78c09a3989999f875e5069701d04c1e6`. Runtime `SOURCE_COMMIT` ve üretilmiş ödeme metadata SHA'ları aynı exact kaynağa eşit. Eski `85e15d0cf9ae` container kaldırıldı. Her iki image tag tam yayın SHA'sını içeriyor.

Resmi generator işlevleriyle ve bağımsız ikinci hesapla yeni PayTR TEST adayı `sha256:3540084a94a729fb1d1db52f32c432aef0fb535244f4806f4855cbde9fdf88ab`, LIVE adayı `sha256:3dbeb35c6828f77f459cb5c8359829198a02b459dccfa55b0a566cf5a89c2ca9` olarak doğrulandı. Önceki değerler TEST `sha256:fa85c21e6659920b4100eacd349c53866c9a185559f87661518a17ff9c5f39e0`, LIVE `sha256:8dfd5927e7799285685b1713801f55cad636ce0bf3f5d3a9f1039cd71cfcdb3d`. Tüm payment-adapters, iki generator ve panel payment binding kaynakları eski/yeni commit arasında aynıdır. Mevcut iki digest ve `SOURCE_COMMIT` güncellenir; modlar, build/runtime bayrakları ve kimlik bilgileri korunur. `.net` için ödeme onay değişkenleri kapalı kalır. Iyzico authority eklenmez. Hiçbir ödeme/sağlayıcı işlemi yapılmaz.

## Doğrulama

- Barkod uygulama commit'i `c6c6541308abee9965887ab046083d3052eb8d5b` üzerinde contracts: 352/352; data: 657/657; panel: 1407 başarılı, 1 mevcut skip, 0 hata ve ikinci test grubu 62/62. Bağımsız inceleme bu barkod değişikliklerinin son yayın kaynağında aynen korunduğunu doğruladı.
- Son değişen istemci/HTTP testleri: 6 + 21 başarılı; contracts/data/panel TypeScript kontrolleri ve owner build başarılı.
- Güncel yayın kaynağında müşteri paneli production build başarılı; 89 sayfa.
- Canlı sağlık ön kontrolü: Güzide tenant adresi, iki Güzide özel admin adresi ve Siora tenant adresi HTTP 200, `status=ok`, Redis `ready`. Tenant tanımlanmayan iki genel panel kökünün sağlık yanıtı ön kontrolde 404; bu kökler tenant sağlık kanıtı değildir.
- 156 sonrasında aynı dört tenant/özel admin adresi yeniden HTTP 200, `status=ok`, Redis `ready` verdi.
- Coolify sabit commit ve kalıcı `SOURCE_COMMIT` iki panelde aynı; pre/post hook digest'leri ve Auto/Preview Deploy kapalı ayarları değişmedi.
- Geri yüklenen PostgreSQL kopyasında gerçek üyelik/plan yetkisiyle rezervasyon, tekrar isteği, iki farklı barkodsuz varyanta toplu kaydetme, mevcut barkodu koruma ve sürüm çatışması kontrolleri başarılı. Aynı rastgele aday tekrar ettirilerek rezervasyon/ürün çakışmaları önlendi; iki indeks kopya girişini reddetti. Yanlış üyelik/plan hiçbir işlem yazmadı. Tüm test işlemleri geri alındı; 1691 varyant ve 20 işlemin bütün satırları başlangıçla birebir aynı. Yeni fixture oluşturulmadı. [SQL kanıtı](evidence/internal-barcode-ean13/rehearsal-integration.sql), [çalıştırma sonucu](evidence/internal-barcode-ean13/rehearsal-integration-result.txt).
- Canlı barkod düğmesi kontrolü: iki alan adında kullanıcı tarayıcı oturumları yeniden giriş istiyor. Kimlik bilgisi alınmadı; kullanıcıya açık ekranda giriş yapma olanağı sunuldu. Yayın ve backend doğrulaması buna bağlı olarak durdurulmadı.

## Geri dönüş

Önce 156 down ile eski sayısal işlevleri geri getirin; ardından önceki panel kaynağını yayınlayın. Önceki dal `codex/mira-products-category-order-release`, sabit SHA ve `SOURCE_COMMIT` `0a36a6c4d107a7b71d1531dfb920c48ad7011ed8`; mevcut PayTR digest'lerini yukarıda kaydedilmiş önceki değerlerine geri getirin. Yeni EAN-13 işlem kaydı varken 155 down uygulanmaz. Başarılı deneme geri dönüşü, canlıda yeni kayıtlar oluştuktan sonra 155 down yapılabileceği anlamına gelmez.
