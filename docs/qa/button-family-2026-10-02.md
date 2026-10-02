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

Canlıya yayımlandığı henüz iddia edilmiyor. Muhasebe yayınıyla sıra koordine ediliyor; ortak yayın dalı ve kuyruk bu çalışma sırasında değiştirilmedi.
