# Store engagement QA — 2026-10-04

## Durum

Yerel storefront uygulaması ve bağımsız kaynak incelemesi tamamlandı. Veritabanı klonundaki kabul, canlı yayın ve canlı tarayıcı kabulü root tarafından yürütülüyor; bu kayıt yayımlandığını doğrulamaz.

## Storefront doğrulaması

- Odaklı testler: **39/39 PASS**. Çalıştırılan dosyalar: `components/StoreEngagement.test.ts`, `components/GuzideCartHistory.test.ts`, `lib/cart/client.test.ts`, `lib/checkout/quote-queue.test.ts`, `lib/engagement/client.test.ts`, `lib/engagement/integration.test.ts`.
- Storefront TypeScript kontrolü: **EXIT 0**. Değişikliklerde `git diff --check` temiz.
- Güzide, Siora, Alpler ve Lilyum'un gerçek `CartStatusProvider` bileşeniyle layout dışındaki runtime bağlantısı test edildi. İletişim penceresi açılmadan sepet kapanıyor; Güzide/Alpler'in sahip olduğu geçmiş kaydı tüketiliyor, aynı ürün rotası ve ilgisiz geçmiş verisi korunuyor. Tek modal kalıyor; kapatınca odak ürün düğmesine dönüyor.
- Yalnız başarıyla ayrıştırılmış ürün ekleme olayı tetikliyor. İlk yükleme, adet değiştirme, kaldırma ve başarısız ekleme tetiklemiyor. Geciken ayar/oturum yanıtları, ikinci eklemenin ilk gecikmeyi iptal etmemesi, hesap/ödeme rotaları ve rota yarışı doğrulandı.
- Pazarlama izni başlangıçta boş ve isteğe bağlı. İptal, çift gönderim, hata sonrası aynı işlem kimliğiyle tekrar deneme ve girilen bilgilerin korunması test edildi. Tarayıcı kalıcı verisinde iletişim bilgisi tutulmuyor; kapsam mağaza/host, gösterim zamanı, kupon ve tamamlandı işaretiyle sınırlı.
- Boş sepette tanıtım kuponu saklanıp sonraki başarılı eklemede bir kez sunucunun quote akışına gönderiliyor. Ayrı popup/checkout istemcilerinin quote HTTP yanıtları ortak cookie sınırında sıralanıyor; bu yarış için RED → GREEN regresyon testi mevcut.

## Bağımsız inceleme

Root'un storefront runtime/HTTP/default bağlantıları, native 215, ortak sözleşmeler ve repository, admin HTTP/runtime/client kaynakları salt okunur incelendi. Güvenilen host ve `c1` sepet kimliği; tenant/yetki, beklenen sürüm, işlem tekrarı, belirsiz COMMIT kurtarması ve kupon sınırları kontrol edildi. Yeni lead, müşteri hesabı veya doğrulanmış sahiplik oluşturmuyor. Aktif canonical kupon seçimi mevcut sunucu promosyon değerlendirmesini kullanıyor.

**P2 bildirildi:** Önceden kullanılan görsel arşivlendikten sonra yalnız Açık → Kapalı değişikliği, native save'in koşulsuz aktif görsel doğrulaması nedeniyle reddedilebiliyordu. Dar düzeltme bağımsız incelemeden geçti; mevcut kampanyanın aynı görseliyle yalnız kapatmaya izin veriliyor. İzole native kabulde arşivlenmiş görselle kapatma ve değiştirilmiş yabancı görseli reddetme geçti. Bunun dışında incelemede ek somut P1/P2 bulunmadı.

## Root tarafından bildirilen yerel sonuçlar

- Root odaklı testleri: **54 PASS**.
- Ortak storefront production build: **EXIT 0**.
- Ortak customer panel production build: **EXIT 0**.
- Ortak customer panel TypeScript kontrolü: **EXIT 0**.
- Build çıktılarında admin `/discounts/popups`, `/api/store-engagement/campaigns` ve storefront `/api/store-engagement`, `/api/cart/contact` rotaları mevcut.

## Native ve admin kabulü / bekleyen yayın

- İzole native klonda son SQL215 down → up → assertions: **EXIT 0**. Guest quote gerçek katalog fiyatından **%3** indirimi doğruladı. Tenant, CAS, tekrar, kupon süresi, iletişim koruma ve kota kontrolleri geçti; bütün fixture işlemleri ROLLBACK. **1644** mevcut native function için tanım/sahiplik/ACL farkı **0**; müşteri/stok/finans/ödeme kayıtları değişmedi.
- Admin odaklı UI/istemci/menü kontrolleri **79/79 PASS**. Sözleşme/repository/migration kontrolleri **10/10 PASS**, saas-data TypeScript **EXIT 0**.
- Root'un ortak sürüm yayını ve canlı doğrulaması.
- Gerçek tarayıcıda görünüm, modal/rota davranışı, iletişim kaydı ve kuponun ödeme akışında doğrulanması.

Üretimde tahsilat, müşteri kimliği veya finans verisi oluşturan bir kabul işlemi bu kayıt kapsamında yapılmadı.
