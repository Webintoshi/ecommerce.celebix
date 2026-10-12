# Sipariş satış kanalı filtreleri — 12 Ekim 2026

## Kapsam ve işlev envanteri

Kullanıcının amacı: Siparişler listesini manuel satış, sosyal medya ve sosyal medya platformuna göre ayırmak. Ortak Customer Panel üzerinden bütün mağazalara yayımlanacak.

Korunan işlevler: göndererek arama ve temizleme, klavye arama kısayolu, yenileme, sütun seçimi, yüklenen/görüntülenen satırların CSV çıktısı, manuel satışa geçiş, durum kısayolları, tutar/tarih sıralaması, tarih/ödeme/teslimat filtreleri, filtreleri temizleme, liste/detay bağlantıları, cursor ile daha fazla yükleme ve başarısız yükleme tekrar denemesi. Masaüstü tablo ve mobil kart düzeni korunur. Mevcut filtre penceresinde Uygula, kapatma ve odak dönüşü korunur.

Yeni kanal/platform seçimleri tüm siparişleri sunucuda filtreler ve cursor kapsamına katılır; eski istemcilerin yanıt yapısı ile filtresiz sorguları korunur. Manuel satış eski manual/in_store siparişlerini ve güncel manual satışlarını kapsar; sosyal satışlar ayrı tutulur. Platform sadece sosyal kanalla birlikte seçilir; kanal değişince platform temizlenir. Finans/stok/satış mutasyonları değiştirilmez.

## Başlangıç ve yayın sahibi

Çalışma dalı codex/order-sales-channel-filters. Canlı ortak panel kaynağı ve ortak ref 1d2cc2da7abe491f4f0732acc0789ac2a83b8d5e; kuyruk boş olarak salt okunur doğrulandı. Güncel sidebar kodu çalışma tabanına alındı. Tek yayın sahibi Cemo; Mira'ya mevcut kullanıcı koordinasyon yetkisiyle bilgi verildi ve Mira bu slotta ref/pin/kuyruğa müdahale etmeyeceğini doğruladı. Yeni okuma desteği için 202610120227 numarası önerildi; canlı uygulama öncesi sıra doğrulanacak.

## Kabul planı

- Kanal/platform sunucu sayfalarında korunur; kanal değişince platform ve eski sayfa temizlenir.
- Geciken sosyal sayfa manuel satış listesine eklenmez.
- SQL filtreleri LIMIT/cursor öncesinde çalışır; tenant/arşiv ve yetki sınırları korunur.
- Filtre penceresinde Uygula/kapat/temizle, hata/boş durum ve mevcut yerel filtreler doğrulanır.
- 1440, 1024 ve 390 genişliklerinde odak/klavye ve taşma kontrol edilir.
- Uyumlu veri desteği sonrası ortak panel NET → SITE yayını ve canlı Butik Siora kabulü doğrulanır.

## Yayın öncesi sonuçlar

- Customer Panel TypeScript ve Next üretim derlemesi başarılı.
- Sipariş HTTP/istemci/controller hedef testleri: 42/42 geçti. Kanal/platform değişimi, cursor, eski geciken sayfanın reddi, hata sonrası tekrar yükleme ve mevcut CSV/arama davranışları dahil.
- Ortak contracts testleri 580 geçti; data testleri 1003 geçti, 4 mevcut isteğe bağlı test atlandı. İlgili contracts/data typecheck başarılı.
- SQL 227, izole PostgreSQL 16 üzerinde gerçek yetkiler/tenant/archive, yedi platform, dört sıralama, LIMIT öncesi filtre, READ ONLY, eski işlev tanım/sahip/ACL korunması ve DOWN/yeniden uygulama testlerini geçti.
- 10.000 ek sipariş/satışla (%80 manuel/%20 sosyal) sentetik performans kontrolünde gerçek okuyucu 31–34 ms; satış tablosu bir kez hash eşleştirmeyle tarandı. Bu önbellekteki yerel ölçüm canlı SLA veya tüm ölçekler için garanti değildir; yeni index eklenmedi.
- Gerçek liste/dialog bileşenleri ve CSS ile yerel tarayıcı kontrolü: 1440, 1024, 390 genişliklerinde sayfa taşması 0; Uygula görünür; konsol hata/uyarı 0. Sosyal+Instagram Uygula, manuel draft+Escape ile eski seçimin korunması/odak dönüşü ve Temizle+Uygula doğrulandı. Önizleme görselleri evidence/order-sales-channel-filters altında.
- Atlas bağımsız kod/SQL incelemesinde engelleyici bulgu yok.

## Canlı yayın ve kabul

12 Ekim 2026 NET → SITE sırasıyla tamamlandı. İki çalışan panelin image ve SOURCE_COMMIT değeri `5f36c075560e26909bbe6f4d35b02358ee5f769d` olarak salt okunur doğrulandı. Global yayın kuyruğu boş.

- NET dağıtımı: `stp0xcsnkn2czbymtk0umf6g` — finished.
- SITE dağıtımı: `a75nww3eqh8w7qzkfnwp52v9` — finished.
- SQL 227 yedek sonrası uygulandı: 1767 eski işlev tanım/sahip/ACL/config değeri aynı; yalnız üç yeni okuma işleviyle toplam 1770. İş/sipariş/ödeme/stok verisi yazılmadı. Sunucuda tutulan tam yedek arşivi doğrulandı; DOWN/yeniden uygulama izole PostgreSQL'de geçti. Geri alma sırası önce eski panel kodu, ardından gerekirse yeni okuyucuların DOWN dosyasıdır.
- Kaynak ref atomik beklenen sürüm kontrolüyle ilerletildi. İki panelin yalnız mevcut SOURCE_COMMIT değeri ve git pin değişti; yeni env kaydı eklenmedi. Ham şifreli ortam kayıtları, bayraklar, dallar, Google/native keyring ve ödeme çalışma biçimleri korundu. Owner/vitrin dört çalışan container ve tüm diğer ayarlar aynı kaldı. Witness uygulamaların önceden farklı olan image/git pin ve SOURCE_COMMIT değerleri ayrıca korunmuştur.
- Butik Siora'da gerçek oturumla sosyal medya 3, Instagram 3, WhatsApp 0 sonucu; manuel satış 20 → 40 → 43 cursor sayfalaması doğrulandı. Manuel sonuçlarda yalnız manuel kanal vardı. Manuel kanala geçişte platform kaldırıldı; filtre temizleme varsayılan listeyi geri getirdi.
- Canlı NET'te 1440×900, 1024×900 ve 390×844: sayfa taşması 0, pencere ve Uygula görünür. Escape draft seçimi uygulamadan kapattı ve odağı Filtreler'e döndürdü. Uygulama kaynaklı konsol hata/uyarı yok; mevcut üçüncü taraf tarayıcı uzantısının M_ID hataları uygulama hatası olarak sayılmadı.
- SITE'te çalışan kaynak ve derlenmiş çalışma zamanı/Google/ödeme korunması doğrulandı. Güzide tarayıcısı oturum açma sayfasındaydı; Güzide için yeni kimlik bilgisi veya oturum üretilmedi. Yetkili tarayıcı kabulü NET/Butik Siora'da yapıldı. NET ve SITE alan adlarında filtresi verilmiş anonim Sipariş API çağrıları 401 döndü.
- Kalıcı test siparişi veya sahte tahsilat oluşturulmadı; ödeme sağlayıcısı ve Google mutasyonu çağrılmadı.

Bu sürüm ortak Customer Panel uygulamalarını kullanan mevcut ve yeni mağazalara uygulanır. Özet kanıt `evidence/order-sales-channel-filters/final-verification.json`; canlı popup ekran görüntüsü müşteri bilgileri Git'e aktarılmadan yerelde tutulur.
