# Güzide çift görselli ürün sayfası uygulaması

2 Ekim 2026. Kullanıcı HTML yerleşimini onayladı ve uygulanmasını istedi. Yazı tipi tercihi ayrıca doğrulandı: **canlı Güzide fontları korunacak**. Canlı DOM ölçümü: ürün başlığı Arial/Helvetica/sans-serif 500; arayüz Bai Jamjuree 400; fiyat Bai Jamjuree 450. Mevcut admin tipografi kaynakları ve logo korunur.

Başlangıç, NET/SITE üzerinde doğrulanmış ortak storefront sürümü `6853d51b7afbadccf2b8f45312d16095602aa16b`. Güzide'ye bağlı mevcut worktree bu sürüme fast-forward edildi. Panel/SQL198/SQL199 işlemleri bu çalışmanın kapsamında değildir.

1. Güzide tenant seçicisiyle yalnız ürün route'una yeni deneyimi bağla. Server veri yükleme, canonical, metadata, JSON-LD ve diğer tenantların akışları korunur.
2. Varyant medya provider'ı, seçilen varyant fiyatı/SKU ve gerçek sepet istemcisiyle iki büyük fotoğraf, yakınlaştırma ve satın alma alanını uygula. Tek/boş fotoğraf ve unavailable varyantlar doğru ele alınır.
3. SKU, marka, açıklama, bakım, sertifika, rehber, ilgili ürünler, yorumlar, adet ve mobil sabit satın alma seçenekleri admin bayraklarına göre çalışır. Metin/görsel/fiyat/stok sayısı uydurulmaz.
4. Yerel React fixture ile desktop/mobil ve gerçek contract akışını doğrula; shared app typecheck/build ve ilgili sözleşme kontrollerini tamamla.
5. Yalnız bu çalışmayı commit/push et; güncel sağlıklı baseline, boş yayın kuyruğu ve mevcut NET/SITE ödeme profilleriyle tek tek yayınla; canlı ürün ve fontları doğrula.

Bu repository Güzide'yi ayrı bir `apps/storefront-guzide` app'i yerine `apps/storefront-shared/themes/guzide` tenant temasıyla çözüyor. Görsel çalışma bu temada, bağlama değişikliği yalnız resolved Güzide tenant'ın ürün route'unda tutulur.

## Doğrulama

- Canlı site ve yeni React ekranında ürün başlığı Arial 500, gövde/CTA Bai Jamjuree 400 ve fiyat Bai Jamjuree 450 ölçüldü. Yeni font kaynağı eklenmedi.
- Yerel gerçek bileşenler 1280, 820, 390 ve 320 px genişlikte incelendi; sayfa yatay taşmıyor. Mobil fotoğraf sayacı, varyant değişiminde medya/fiyat/adet sıfırlama, stok dışı ve tek/boş görsel durumları kontrol edildi.
- Gerçek sepet istemcisi seçilen varyantı ekliyor; doğrudan satın alma mevcut sepeti güncelleyerek `/checkout` adresine gidiyor. Yerel fixture ödeme uçlarını kapatıyor; sipariş veya ödeme oluşturulmadı.
- Büyütme, Escape, odak ve scroll dönüşü; mobil sepet kapanırken sabit butona odak dönüşü kontrol edildi. Admin görünürlük bayrakları kapatıldığında ilgili alanlar gizleniyor.
- Shared storefront typecheck ve production build geçti. İlgili ürün, tenant izolasyonu, açıklama, SEO, adet ve sepet kontrolleri: 32/32 geçti. Kalıcı satın alma, varyant medya ve ortak footer kontrolleri: 22/22 geçti; bunların 8'i yeni Güzide satın alma davranışlarını doğruluyor.

Yalnız onaylanan çift görsel yerleşimi temaya özeldir. Gram, ayar, beden, bakım, sertifika veya teslimat metni arayüz tarafından üretilmez; yalnız mevcut ürün ve yayınlanmış admin verileri gösterilir. Yerel QA senaryolarındaki örnek varyantlar ve içerikler canlıya eklenmez.
