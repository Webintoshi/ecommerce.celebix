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

Henüz canlıya yayımlanmadı. Canlı kabul ve dağıtım kimlikleri yayın sonrası eklenecek.
