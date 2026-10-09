# Sepet ve ödeme önerileri

## Kullanıcı onayı ve amaç

Kullanıcı, OrderBump araştırmasında önerilen Mağaza Araçları özelliğinin uygulanmasını istedi. Mağaza sahibi tamamlayıcı ürünleri ve kurallarını kendisi belirleyecek; mevcut alışveriş, ödeme ve diğer araçlar korunacak. Bu belge onaylanan kapsamın uygulama kararlarını kaydeder.

## Davranış

- Ayarlar → Mağaza Araçları içinde **Sepet ve ödeme önerileri**. Yeni mağaza ve mevcut mağazada varsayılan kapalı; ek kurulum yok.
- Bir ayar belgesi: açık/kapalı, başlık, yan sepet/ödeme gösterimi, en fazla 1–3 ürün ve sıralı en fazla 20 kural.
- Kural: kimlik, isim, açık/kapalı, seçili ürünler/kategoriler, isteğe bağlı alt/üst sepet tutarı ve seçili 1–6 varyant.
- Aynı ürün veya kategori grubunda herhangi biri eşleşir; dolu gruplar ve tutar koşulları birlikte sağlanır. Boş gruplar tüm dolu sepetlere uygulanır. Tutar kuruş olarak, indirim öncesi ürün ara toplamıyla karşılaştırılır.
- İlk uygun kural/varyant sırası önceliklidir. Sepetteki ürünler, yayından kaldırılmış ürünler, farklı mağaza kaynakları ve stokta olmayan varyantlar önerilmez. Aynı ürün ikinci kez önerilmez.
- Fiyat güncel katalog/gram tarifesi otoritesinden gelir. Öneri ayrı fiyat veya indirim otoritesi değildir. Ürünlere isteğe bağlı indirim mevcut İndirimler akışında tanımlanır; gerçek indirim normal ödeme teklifinde hesaplanır.
- Ürün açık müşteri tıklamasıyla, mevcut sunucu sepet ekleme API'sinden bir adet eklenir. Yeni ürün eklenince sepet, kargo ve ödeme teklifi mevcut motor tarafından yenilenir.
- Öneri yüklenemezse bölüm gösterilmez, sepet ve ödeme çalışmaya devam eder. Eski veya yanlış sepet sürümüne ait öneri gösterilmez.
- Ödeme önerileri normal sepet checkout'unda, PayTR'ye geçmeden önce yer alır. Ayrı tek ürün `buy_now` intent'inde gösterilmez; kart/sonuç/başarı sayfasına eklenmez.
- Ödeme başlatılırken yeni ürün eklenemez. Ekleme başlarken önceki teklif/digest ve değiştirilmiş sepetin eski işlem anahtarı kullanımdan çıkarılır. Form ve kupon seçimleri korunur. Belirsiz ekleme sonucu otomatik tekrar eklenmez, salt okunur sepet kontrolü yapılır.
- Uygula gerçek kaydı günceller. Kurallar Uygula ile kaldırılır; ek taslak/yayın adımı yok. Hata ve sürüm çatışmasında girişler korunur; sonucu belirsiz aynı kayıt aynı işlem anahtarıyla tekrar edilir.

## Bağımsız veri sınırı

Yeni `order-bumps` sözleşmesi ve repository. Mevcut contact widget, popup, restock, promotion, cart ve checkout sözleşmelerinin şekli değiştirilmez. Singleton ayar ve append-only işlem günlüğü için iki yeni özel tablo; mevcut ayar fonksiyonlarına wrapper eklenmez. Sıfır sürüm ilk kaydı ifade eder, sonraki sürümler monoton artar; kayıt silinip sürüm yeniden başlatılmaz.

Admin API `GET/POST /api/order-bumps`, `GET /api/order-bumps/options`. Giriş, doğrulanmış tenant context, configuration.read/manage, izinli origin, beklenen sürüm ve Idempotency-Key. Başkasına ait kaynaklar kaydedilemez. İşlem günlüğü mağaza ve gerçek kimlikle aynı transaction'da oluşur.

Public API `GET /api/order-bumps?placement=side_cart|checkout`. Mağaza gerçek hosttan, sepet HttpOnly cart credential'dan çözülür. İstemciden mağaza, sepet kimliği, sepet tutarı veya fiyat alınmaz. Tek sınırlı salt okunur sorgu, en fazla üç kanonik kart döndürür. Katalog fiyatı değişmiş eski sepetlerde öneriler normal fiyat yenilemesine kadar gizlenir.

## Ortak arayüz

- `OrderBumpSettings`: schemaVersion:1, enabled:boolean, heading:string, placements:{sideCart:boolean,checkout:boolean}, maxOffers:1|2|3, rules:OrderBumpRule[].
- `OrderBumpRule`: id:string, name:string, enabled:boolean, productIds:string[], categoryIds:string[], minSubtotalCents:number|null, maxSubtotalCents:number|null, variantIds:string[]. Ürün/kategori listesi en fazla 20, varyant listesi 1–6.
- `OrderBumpWorkspace`: version:number (0 dahil), updatedAt:string|null, config:OrderBumpSettings.
- `OrderBumpOption`: id:string, label:string, productId:string|null, priceCents:number|null, available:boolean. `OrderBumpOptionsPage`: items:OrderBumpOption[], page:number, totalCount:number. Tür product/category/variant, normal sayfa 20; seçili ids okuması en fazla 400.
- `OrderBumpPublicOffers`: cartVersion:number|null, heading:string|null, offers:OrderBumpPublicOffer[]. Offer: ruleId, productId, variantId, slug, title, variantTitle, priceCents, currency:'TRY', media:{url,altText,width?,height?}|null.

## Doğrulama ve yayın

Sözleşme/HTTP/native: mağaza ayrımı, gerçek yetki, kaynak doğrulaması, CAS, tam replay, commit belirsizliği, geçersiz JSON/sınırlar, eşzamanlı kayıt. Public: kurallar, çoklu kategori, fiyat drift, stok rezervasyonu, yayımlama ve boş sepet. UI: kayıt/silme/sıralama, hata sonrası veri, erişim, mobil 1440/1024/390 ve klavye. Checkout: ekleme sırasında eski digest ile ödeme yok, belirsiz sonucu tekrar ekleme yok, form/kupon korunması; normal ve buy-now ödeme regresyonları.

İzole native kabul ve rollback, ardından mevcut canlı veri/fonksiyon/rol/servis korunmasıyla additive migration. Tek yayın sahibi root/Cemo; ortak veri → ortak storefront → NET/SITE panel. Yayın öncesi kuyruk/source/pin yeniden okunur; başarılı çalışma yalnız intended live kaynaklar ve kabul doğrulandıktan sonra bildirilir. Üretimde sahte sipariş/tahsilat oluşturulmaz.
