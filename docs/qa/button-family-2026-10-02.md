# Ortak buton ve filtre ailesi — 2 Ekim 2026

## İnceleme ve işlev envanteri

25 Eylül `button-directions.html` sunumu uygulamaya bağlanmamıştı. Canlı 4a4cd613 sürümünde ortak `.button` 48px/16px, turuncu gradient ve gölge kullanıyor; sayfaya özel stiller ortak kuralı ayrıca eziyor. Canlı Analizler ekranında tarih aralığı, Kıyasla ve Filtreler kontrolleri incelendi.

Kullanıcının temel işi mevcut işlemi hızlıca bulup çalıştırmak. Bu çalışma sunumdaki önerilen **Yumuşak yüzey** ailesini mevcut kontrollere uygular: 44px dokunma alanı, 8px köşe, grafit ana işlem, yumuşak nötr ikincil işlem, gölgesiz/hareketsiz hover ve grafit klavye odağı.

Korunacak işlevler:

- Ortak işlem bağlantıları, kaydet/oluştur, dışa aktar, yeniden dene, iptal, bekleme ve devre dışı durumları.
- Dashboard yerel tarih seçimi, tarih açıklaması ve mevcut işlem bağlantıları.
- Analizler tarih seçimi, özel tarih aralığı, karşılaştırma, filtre aç/kapat, URL durumu ve geri/ileri davranışı.
- Ürünler, markalar, kategoriler, koleksiyonlar, siparişler, indirimler, tasarım ayarları ve SEO ekranlarında mevcut ana/ikincil işlemler ve araç çubuğu seçimleri.

Veri giriş alanları, silme/arşiv anlamları, sekmeler, ana navigasyon, görsel kartları, mağaza önizleme tasarımı ve işlem sözleşmeleri aynı ayrı stilleri kullanır. API/SQL değişikliği yok.

## Doğrulama

- TypeScript kontrolü ve üretim derlemesi PASS. İlk derleme sırasında düzenlenmekte olan CSS yorumunda görülen hata düzeltildi; sabit aday ikinci derlemede başarıyla tamamlandı.
- Atlas bağımsız frontend incelemesi PASS. Analizler font resetinin yerel kontrol tipografisini ezmesi düzeltildi; primary/danger birleşimleri korunuyor.
- Analizler, ürün listesi ve dashboard gerçek uygulama bileşenleri yerel fixture içinde 1440/1024/390 px genişliklerde incelendi. Dokuz ekran görüntüsü ve ölçümler `evidence/button-family-2026-10-02/` altında; her ölçümde sayfa yatay taşması 0.
- Tarih kontrolü 44px, 8px köşe, 500 ağırlık; mobilde 16px. Tarih değişimi URL'ye yansıdı, Kıyasla basılı durumu ve filtre aç/kapat korundu. Klavye odağı 2px grafit/2px aralıkla görünür.
- Ürün Ekle gerçek hesaplanan stili grafit/görünür açık metin, 44px ve 8px. Toplu Uygula seçimsiz durumda devre dışı kaldı. Satır adedi seçimi aynı aileye bağlandı.
- Dashboard dönem seçimi, tarih açıklaması, koyu banner içindeki açık işlem ve mobil yerleşim incelendi.
- Diğer onaylı 10 CSS module mevcut kontrol aileleri üzerinden güncellendi; Next CSS Modules pure/scope derlemesi PASS. İşlem kodu, API ve SQL değişmedi.

## Ortak yayın ve canlı doğrulama

- Muhasebe yayını tamamlandıktan sonra `9a09c129` + QA tip `e840fa58` birleştirildi. Exact ortak aday `7bc66874bf6a4f0b9fa3d19061bb27b87a45258f`; bu adayın üretim kodu build alınan `d29ec0ef` ile aynı. API/SQL/ödeme kaynakları muhasebe baseline ile byte-exact.
- NET deployment `v6nhzh8kfe1t5el7f293nskx` finished; exact runtime/image, ödeme profili ve 333 kaynak cohort kontrolü PASS. Butik Siora canlı tarih seçimi 44px / 8px / 500 / nötr yüzey / gölgesiz olarak doğrulandı. Kanıt: `evidence/button-family-2026-10-02/live-butik-siora-analytics.png`.
- SITE ilk dispatch öncesi `UNEXPECTED_CONFIGURATION_DRIFT` ile durdu; SITE receipt oluşturulmadı. Ayrı Deniz storefront yayını `926bbb57` → `e89019ff` tamamlanmıştı. İki finished receipt, exact source/runtime/image/health, payment profile ve V3 source kontrolü bağımsız doğrulandı. Diğer storefront alanları, preview satırları, env kimlikleri/flags ve ödeme semantiği aynı; değişen digest ciphertext değerlerinin plaintext eşitliği doğrulandı.
- Deniz yeni storefront yayınlarını SITE tamamlanana kadar HOLD etti. Orijinal snapshot/spec/prepared/NET receipt değişmeden, yalnız iki storefront tanığı aynı adaya bağlı sabit fingerprintli append-only handoff ile geçirildi. Panel baseline karşılaştırması korundu. Bağımsız artifact/helper review, PHP lint, 139 eski + 65 handoff pure guard kontrolü PASS. Artifact `7fa5b8a3…`, bağlı helper `1857f47f…`; genel drift koruması gevşetilmedi.
- Credit gate enabled / version2; SQL198 ve SQL200/201 46 fonksiyon kontrolleri PASS. Finansal veri veya sağlayıcı işlemi çalıştırılmadı.

- SITE deployment `pjs71y0fhcw3zdxcy1xmzmwd` finished, exact `7bc66874`. Fresh final verify PASS: iki panelin exact runtime/image/ödeme profili/cohort, schema/credit gates, iki onaylı storefront tanığı ve global idle. İki resmi receipt sırası NET → SITE; NET ownership aynen korundu.
- Güzide canlı Ürün Ekle: grafit `rgb(43,43,43)`, açık metin, 44px / 8px / 500 / gölgesiz. Satır sayısı kontrolünün dış label yüzeyi nötr `rgb(240,237,232)`, 44px / 8px / 500; iç native select şeffaf. Console warning/error listesi boş. Kanıt: `evidence/button-family-2026-10-02/live-guzide-products.png`.
- Yayın tüm NET/SITE müşteri admin domainlerine aynı ortak sürümle yansıdı; Butik Siora, Alpler ve Güzide bu iki ortak runtime'ı kullanır. Deniz HOLD final verify sonrasında kaldırıldı. Yalnız root'a ait yerel QA sunucusu durduruldu.
