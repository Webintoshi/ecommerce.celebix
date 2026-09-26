# Ürün editörü canlı yayın kontrolü — 2026-09-26

Durum: iki paylaşılan Customer Panel yayını, runtime doğrulaması ve yayın sonrası sağlık kontrolleri başarılı. Siora oturum açık görsel/etkileşim kontrolü tamamlandı; Güzide oturum gerektiren kontrol giriş bekliyor.

## Kaynak ve kapsam

- Kullanıcı ürün editörü tasarımının canlıya alınmasını açıkça istedi.
- Kesin yayın kaynağı: `5635f8234d07b796d59d6eab32273b568d901893`.
- Yayın dalı: `codex/internal-ean13-barcodes`.
- Önceki çalışan ve geri dönüş kaynağı: `dfb01b773c9e88ff1a1a89eaa1bce26e7a61c876`.
- Kapsam: iki aktif paylaşılan Customer Panel uygulaması. Owner, Storefront, veritabanı, DNS ve kimlik doğrulama ayarları değiştirilmez.

Onaylanan ürün editörü önceki yayında iki panelde zaten bulunuyordu. Oturum açık Siora ekranının kontrolünde varyant satırındaki “Fiyat yöntemi” düğmesinin ikonlar için kullanılan 36px genişliğe sıkıştırıldığı ve “Arşivle” ile çakıştığı görüldü. Bu ek CSS düzeltmesi metin düğmesine doğal genişlik ve yatay boşluk verir, düğmelerin küçülmesini önler, varyant satırlarını 1280px altında alt alta düzenler ve mobil ikon hedefini 44px korur. Genel çalışma alanının 1120px eşiği korunur. Başlıktaki varyant oluşturma düğmeleri ikon boyutlandırmasından etkilenmez.

## Kontroller

- Yerel Customer Panel production build başarılı, çıkış kodu 0. Log: `/tmp/customer-panel-product-editor-action-build.log`.
- Önceki kaynak üzerinde ürün konsolu testleri 50/50 ve TypeScript kontrolü başarılıydı. Son değişiklik yalnız CSS; bağımsız seçici/duyarlı yerleşim incelemesi geçti.
- Yayın öncesi dört adresin `/api/health` yanıtı HTTP 200, `status=ok`, Redis `ready`: Siora tenant adresi, Güzide `.site` tenant adresi, `admin.guzidekuyumcu.com.tr` ve `admin.guzidekuyumcu.com`.
- Siora ürün editörü oturum açıkken incelendi. Güzide tarayıcı oturumu yeniden giriş istiyor; oturum gerektiren Güzide ürün editörü kontrolü tamamlanmış sayılmaz.
- Önceki/yeni kaynak arasında ödeme kaynaklarının diff'i boş. Resmi generator adayları: TEST `sha256:7e77d19ab957d09266f22f0e944f80145289ff969a5726e105116b159f60fa53`; LIVE `sha256:6b6a2c57a96d2a694159e74437a8aecc3fb0dbe1a3507f22fe4521b3e8ea19e4`.
- Mevcut ödeme modları, build/runtime bayrakları, hook'lar ve kimlik bilgileri korunur. Yeni sağlayıcı authority eklenmez; ödeme işlemi yapılmaz.

## Dağıtım

| Panel | Coolify UUID | Deployment | Durum |
|---|---|---|---|
| Güzide / `.site` | `yk1h6d97z7ex0h74ok3zrj5c` | `r8fq9v2hmdnuw0hoekal1erg` | Başarılı; 2026-09-26 07:24:48 UTC |
| Siora / `.net` | `e4xe74cmii7jucbkyor0o412` | `yehcqkqb8q3zud55vhpbv2r5` | Başarılı; 2026-09-26 07:30:25 UTC |

Güzide çalışan container: `231d86621e5a`, `yk1h6d97z7ex0h74ok3zrj5c-072006317952`; image `sha256:ee32ce2e4d12465e03deb3764bfff1cb480ec7da7a8adb357b98626951e3c502`. Runtime `SOURCE_COMMIT` ve üretilmiş PayTR/Iyzico metadata `gitSha` değerleri kesin yayın kaynağına eşit; PayTR digest'leri aday değerlerle aynı. Yayın sonrasında üç Güzide adresinin sağlık kontrolü yeniden HTTP 200, `status=ok`, Redis `ready` verdi.

Siora çalışan container: `d5d4b086ccca`, `e4xe74cmii7jucbkyor0o412-072550333663`; image `sha256:75757b829774d371b5fa306f424ccb4a2186bc08734bb76da9f662d2bb6d8d38`.

İki uygulamanın sabit commit'i, çalışan image tag'i, kalıcı/runtime `SOURCE_COMMIT` ve üretilmiş PayTR/Iyzico metadata `gitSha` değerleri kesin yayın kaynağı `5635f8234d07b796d59d6eab32273b568d901893` ile aynı. Metadata digest'leri resmi generator adaylarıyla eşleşiyor. Önceki Güzide `3799271558b4` ve Siora `767b2ac31402` container'ları kaldırılmış; `docker ps -a` filtreleri boş. Son kontrolde dört adres de HTTP 200, `status=ok`, Redis `ready` verdi. Yayın öncesi/sonrası hook digest'leri değişmedi; Auto Deploy ve Preview Deployments kapalı. Ödeme modları/bayrakları korundu; `.net` ödeme bayrakları kapalı kaldı.

## Canlı Siora arayüz kontrolü

Yeni ayrı tarayıcı sekmesinde oturum açık ürün editörü, 1440×900, 1024×900 ve 390×844 boyutlarında incelendi. Ekran görüntüleri araç çıktısında incelendi; kalıcı görüntü dosyası kaydedilmedi.

- Üç boyutta yatay sayfa taşması 0; canvas hesaplanan rengi `rgb(248, 247, 245)` / `#f8f7f5`.
- Üç varyant işlem düğmesinde metin taşması yok. Masaüstü düzenle/fiyat/arşiv genişlikleri 36/97/51px; mobilde düğme yükseklikleri 44px ve düzenle genişliği 44px.
- Mobil varyant formu açılıp iptal edildi; barkod, SKU, fiyat, maliyet ve stok alanları mevcut, yatay taşma 0.
- Arşiv onay penceresi açıldığında odak “Vazgeç” düğmesinde; Escape pencereyi kapatıp odağı “Arşivle” düğmesine döndürüyor.
- Kontrol sekmesinin tarayıcı warning/error kayıtları boş. Kontrol sonunda viewport sıfırlandı.
- Canlı veri yazılmadı; barkod üretilmedi, ödeme işlemi veya medya yüklemesi yapılmadı, arşivleme onaylanmadı.

Güzide oturumu giriş istediği için aynı oturum gerektiren arayüz kontrolü Güzide üzerinde tamamlanmadı. Güzide yayın/runtime/sağlık kanıtları yukarıdadır; bu sınırlama görsel kontrol yerine geçmez.

## Geri dönüş

Bu yayın yalnız ürün editörünün CSS düzeltmesidir. Önceki `dfb01b773c9e88ff1a1a89eaa1bce26e7a61c876` kaynağı EAN-13 geçişini içerir; bu kaynağa uygulama geri dönüşü için veritabanı migration veya geri dönüşü gerekmez. Önceki sabit SHA, `SOURCE_COMMIT` ve ödeme build onayı digest'leri birlikte geri yüklenir; modlar, bayraklar, hook'lar ve kimlik bilgileri korunur.

Son kontrolde önceki kaynak etiketli iki geri dönüş image'ı sunucuda mevcut: Güzide `sha256:e6f9a0d1d42ba78f61222d372c1f6b58b3f21c8b9f853143d86bd39d6610ac1b`, Siora `sha256:bcca184a3e941a330057d70d36f8db2a78c09a3989999f875e5069701d04c1e6`.
