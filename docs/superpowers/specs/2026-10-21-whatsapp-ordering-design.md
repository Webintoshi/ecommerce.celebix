# Mağaza araçlarında WhatsApp ile sipariş tasarımı

Durum: Kullanıcı tarafından onaylandı ve ortak sistemde uygulandı. Yayın kabulü uygulama planında izlenir; hiçbir gerçek mağazada özellik otomatik etkinleştirilmez.

## Amaç ve kesinleşen davranış

Mevcut ve yeni mağazalar, Mağaza araçları içindeki bağımsız WhatsApp ile sipariş ver kartından bu özelliği yönetir. Mağazaya ait WhatsApp alıcı numarası, ana açma kapama anahtarı, Fiyatları gizle ve Sepete ekle butonunu gizle seçenekleri bulunur. İletişim balonunun açık olması gerekmez.

Kullanıcının kesinleştirdiği kural: Fiyatları gizle açıkken normal online ödeme kullanılmaz; sepet ürün listesi olarak korunur ve yalnız WhatsApp sipariş talebi alınır. Sepete ekle gizlenmediğinde WhatsApp butonu hem yan sepette hem sepet sayfasında bulunur. Fiyat gizleme bütün mağazadaki güncel ürün fiyatlarını kapsar.

Onaylanan plana göre sepete ekle gizlendiğinde ürün üzerindeki alışveriş eylemi WhatsApp ile sipariş talebiyle değiştirilir ve bu modda yeni standart ödeme başlatılmaz. Paket kapsamı Başlangıç ve üzeridir; mevcut tarifelerin tarihî kayıtları değiştirilmez.

## Rakiplerdeki örnekler ve teknik tercih

[WooCommerce WhatsApp Order and Live Chat](https://woocommerce.com/document/whatsapp-order-and-live-chat/) fiyatları kaldırma ve sepete eklemeyi kaldırma seçeneklerini ayrı sunar; ürün ve sepet mesajlarını düzenlemeye izin verir. [Advanced Catalog Mode](https://woocommerce.com/document/advanced-catalog-mode/) fiyat, sepet ve ödeme görünürlüğünü birlikte yönetir. Shopify ekosistemindeki [SP Order on WhatsApp](https://apps.shopify.com/social-get-a-quote) üçüncü taraf uygulaması da fiyat gizleme ve WhatsApp üzerinden teklif isteme yaklaşımını sunar. Bunlar özellik örnekleridir; Shopify çekirdeğine ait özellik veya doğrulanmış satış artışı olarak değerlendirilmemelidir.

İlk sürüm için öneri, mevcut iletişim bağlantısının doğrulama kurallarından yararlanan ortak bir WhatsApp mesaj hazırlayıcısıdır. [WhatsApp click to chat](https://faq.whatsapp.com/5913398998672934) üzerinden sohbet ve hazır mesaj açılır. Kullanıcı mesajı WhatsApp içinde kendisi gönderir. Butona tıklama, gönderim veya sipariş onayı kanıtı değildir.

Diğer seçenek, Cloud API üzerinden mesaj ve teslim bildirimlerini işleyen ayrı bir entegrasyondur. Bu seçenek hesap, kimlik bilgileri, gelen mesaj işleme ve operasyon gerektirir. İlk sürümdeki isteğe göre daha fazla kapsam ve yük getirir. Başka bir eklentiyi mağazalara yüklemek ise ortak panel ve tema davranışını dış bağımlılığa taşır. Bu nedenle ilk sürümde ortak bağlantı ve mesaj hazırlayıcısı önerilir; bot veya otomatik mesaj alıcısı kapsamda değildir.

## Ayar ekranı

Konum: Ayarlar → Mağaza araçları → WhatsApp ile sipariş ver.

Alanlar:

- WhatsApp ile siparişi etkinleştir.
- Siparişlerin geleceği WhatsApp numarası: ülke koduyla doğrulanır. Müşterinin veya yöneticinin kişisel giriş telefonu otomatik kullanılmaz. Yayınlanmış işletme telefonu varsa düzenlenebilir öneri olarak sunulabilir.
- Fiyatları gizle.
- Sepete ekle butonunu gizle.
- Hazır mesajın kısa giriş cümlesi; ürün satırları ve gerekli bilgiler sistem tarafından eklenir.
- Oluşturulacak mesaj ve seçili mod için canlı önizleme.

Anahtar kapalıyken alt seçimler saklanabilir fakat etkisizdir. Açık modun kaydı geçerli alıcı numarası gerektirir. Hatalı numara, çakışan kayıt veya belirsiz yanıt önceki çalışan ayarı bozmaz; girilen alanlar korunur. Mevcut sürüm kontrolü ve işlem anahtarı kullanılır. Yalnız yetkili mağaza yöneticisi ayarı değiştirebilir. Kaydetme sonrası sonuç sunucudan okunarak doğrulanır. Tasarım yayınlama düğmesi gerektirmez.

## Davranış tablosu

Aşağıdaki satırlar ana özelliğin açık olduğu durumları gösterir.

| Fiyatları gizle | Sepete eklemeyi gizle | Ürün ekranları | Yan sepet ve sepet sayfası | Yeni online ödeme |
| --- | --- | --- | --- | --- |
| Kapalı | Kapalı | Fiyat ve mevcut sepete ekleme; ürün üzerinden WhatsApp talebi | Mevcut ödeme eylemi ve WhatsApp ile sipariş ver | Açık |
| Açık | Kapalı | Fiyat yok; ürünler sepete eklenebilir | Adet ve ürün listesi; fiyat ve toplam yok; WhatsApp ile sipariş ver | Kapalı |
| Kapalı | Açık | Fiyat görünür; sepete ekleme yerine WhatsApp eylemi | Yeni ürün eklenmez; eski sepet silinmez, ürünleri kaldırma ve talep etme korunur | Kapalı |
| Açık | Açık | Fiyat yok; sepete ekleme yerine WhatsApp eylemi | Eski sepet fiyat göstermeden korunur; temizlenebilir veya talep iletilebilir | Kapalı |

Ana özellik kapalıyken mevcut normal mağaza davranışı geçerlidir. Sepete ekle gizleme; kart, hızlı görünüm, detay, mobil sabit alan ve Hemen al gibi eşdeğer yeni satın alma girişlerini kapsar. Sunucu da yeni ekleme ve ödeme başlatma kurallarını denetler. Var olan sepeti görmek, azaltmak veya son ürün dahil silmek engellenmez.

## Müşteri akışı

Ürün talebinde müşteri varyantını ve adedini seçer. Tek seçimli ürün doğrudan ilerleyebilir; birden çok varyantı olan kartta seçim ekranı veya ürün detayı açılır. Sistem ilk varyantı sessizce seçmez. Stokta olmayan veya satıştan kalkmış ürün için satın alınabilir izlenimi verilmez; gerekirse stok bilgisi sorma eylemi gösterilir.

Sepet talebinde eklenmiş ürünler, varyantlar ve adetler topluca hazırlanır. Boş sepette sipariş butonu çalışmaz. Mesaj hazırlanırken güncel ürün ve stok durumu denetlenir. Fiyat gösterilen modda sunucunun geçerli fiyatları kullanılır; kargo henüz hesaplanmadıysa kesin sipariş toplamı gibi sunulmaz. Gizli modda ürün, satır, indirim, kargo veya toplam tutarı mesajda yer almaz.

Mesaj örneği:

> Merhaba, Hızlı Kutu Ambalaj mağazanızdaki aşağıdaki ürünler için sipariş talebim var.
>
> Kraft kutu — 20 × 20 cm — 50 adet
> Ürün bağlantısı: mağazanın kendi ürün adresi
>
> Fiyat ve teslimat bilgisini paylaşır mısınız?

Örnek ürün ve adetler yalnız anlatım içindir. Mesaja mağaza adı, ürün adı, seçili seçenekler, adet ve mağazanın doğrulanmış ürün bağlantısı eklenir. Fiyatlar yalnız görünür modda eklenebilir. Müşterinin kayıtlı adresi, e-postası veya kişisel hesap bilgileri kendiliğinden WhatsApp metnine taşınmaz.

Telefonlar uluslararası rakam biçimine dönüştürülür, metin bağlantıya uygun kodlanır. HTML veya keyfi yönlendirme adresi kabul edilmez. Uzun sepetler sessizce kesilmez: bağlantının desteklenen uygulama ve tarayıcı sınırları aşıldığında tam mesajı kopyalama ve sohbeti açma yolu sunulur. Masaüstü ve mobil desteklenir.

Tıklama sonrasında sepet temizlenmez, stok düşmez, tahsilat veya muhasebe kaydı oluşmaz. Arayüz Siparişiniz onaylandı demez. Mağazanın onayladığı satış mevcut kayıt akışı ve paket yetkisi kapsamında ayrıca işlenir. Tıklama analizi ayrı bir WhatsApp sipariş talebi olayıdır; satış veya mesaj teslimi sayılmaz.

## Fiyat gizlemenin kapsamı

Tek bir mağaza politikası bütün tema ve ekranlara uygulanır:

- Ana sayfa ürünleri, koleksiyon ve kategori listeleri, ürün kartları.
- Arama önerileri ve sonuçları, favoriler, ilgili ürünler, kampanya ve öneri satırları.
- Ürün detayı, hızlı görünüm, varyant seçicileri, fiyat aralıkları ve mobil sabit alan.
- Yan sepetin standart ve Siora sürümü, sepet sayfası ve önceki sepetin geri yüklenmesi.
- Eski fiyat, indirimli fiyat, birim ve satır toplamı, sepet toplamı; bedava kargoya kalan tutar gibi dolaylı fiyat göstergeleri.
- Herkese açık katalog, arama, favoriler, sepet, öneri ve ödeme teklifi yanıtları; sayfanın istemci verileri.
- Ürün yapılandırılmış verilerindeki fiyatlı Offer kayıtları, fiyat meta alanları ve fiyat taşıyan ziyaret olayları.

Gizleme CSS ile yapılmaz. Fiyat verisi gizli görünümde tarayıcıya seri hale getirilmez; iç sistemdeki gerçek fiyat ve muhasebe tutarları korunur. Mevcut public ürün sözleşmelerinin zorunlu sayısal fiyat beklediği yerler için açık bir gizli fiyat görünümü tasarlanır. Sıfır fiyat uydurulmaz. Fiyat filtresi ve fiyat sıralaması gizli modda gösterilmez.

Fiyat politikası ilk sunucu yanıtında uygulanır; fiyatın önce görünüp sonradan kaybolduğu bir yükleme eklenmez. Yanıt hazırlanırken ayar okunamaması, kayıt yok ile aynı sayılmaz. Ayar yoksa mevcut varsayılan davranış; ayar kaynağı geçici olarak erişilemezse fiyatın veya ödeme başlatmanın kendiliğinden açılmadığı güvenli hata durumu kullanılır.

Fiyatların elle yazıldığı eski açıklamalar ve görseller otomatik olarak güvenilir biçimde ayıklanamaz. Dinamik fiyatların tamamı kapsanır; görsel veya metin içine elle yazılmış fiyatlar için yöneticiye önizleme ve içerik kontrol notu gösterilir. Önceden kullanıcının görmüş olduğu fiyatların geri alınacağı söylenmez.

Geçmişte gerçekleşmiş siparişler, faturalar, tahsilatlar ve yetkili yönetici ekranları vitrin fiyat gizlemesinden etkilenmez. Yeni ödeme başlatılması kapalı moda girerken başlamış ödeme işlemlerinin gerçek sağlayıcı sonuçları normal şekilde işlenir; başarılı para hareketleri veya bildirimleri yok sayılmaz.

## Google Merchant ile birlikte çalışma

[Google Merchant açılış sayfası koşulları](https://support.google.com/merchants/answer/4752265?hl=en) görünür, gönderilen bilgilerle eşleşen fiyatı ve satın alma düğmesini ister. Dolayısıyla fiyat gizli veya yalnız WhatsApp üzerinden teklif alınan ürün sayfalarını Shopping ve ücretsiz ürün listelerine normal satış ürünü gibi göndermemek gerekir. Bu sonuç ürün listeleme koşullarıyla ilgilidir; bütün organik Google aramasının kapanması anlamına gelmez.

Plan:

1. Ayar ekranında bu modun Google ürün gösterimlerine etkisini açıkça göster.
2. Ürün yayın uygunluğunu aynı mağaza politikasından türet; gizli fiyat veya gerekli satın alma akışı yoksa yeni gönderimi engelle.
3. Önceden gönderilmiş uygunsuz teklifleri mevcut Merchant kuyruğunun desteklediği delete ve withdrawn akışıyla geri çek; mağazanın kendi ürün kayıtlarını veya bağlantısını silme.
4. Ayar değiştiğinde yalnız ilgili mağazada sürümlü bir uzlaştırma başlat; eski sıradaki gönderimlerin yeni politikayı geçersiz kılmasını engelle. Belirsiz sağlayıcı sonuçlarını mevcut uzlaştırma düzeniyle ele al.
5. Normal satış modu geri geldiğinde aynı kalıcı ürün kimlikleriyle yeniden yayınla. Olağan 48 saatlik genel kontrol ve gerçek fiyat stok değişiklikleri için mevcut hedefli güncelleme düzenini koru.

## Paketler ve mağaza araçlarına erişim

WhatsApp üzerinden talep iletme, panelde manuel satış kaydetmeden ayrı bir yetenek olarak ele alınmalıdır. Başlangıç ve üzeri paketlerde sunulur. Profesyonel paketteki manuel satış, kasiyer ve muhasebe yetkileri bu seçimden türetilmesin.

Mağaza araçları girişi yapılandırma rolüyle erişilebilir hale getirildi. Her kartın görünümü ve kendi API yetkisi ayrı korunur. Mevcut order bump, sepet yakalama, iletişim balonu ve stok bildirimi kartları önceki growth_tools paket kuralını korur; yeni WhatsApp aracı için Başlangıç ve üzeri ek yetki kuralı uygulanır.

Mevcut ticari paket kimlikleri ve anlaşma anı görüntüleri değişmezdir. Yeni WhatsApp yeteneği mevcut ve gelecek ücretli paketlere açık bir ek yetki kuralıyla verilir; eski tarife kayıtları yerinde değiştirilmez.

## Ortak uygulama yapısı

Ayar bağımsız bir whatsapp_order_setting kaydı olarak tutulur. Önce sıkı doğrulanan ortak ayar sözleşmesi ve tekil kayıt, sonra rol ve mağaza yetkileri, ardından hosta bağlı herkese açık güvenli okuyucu eklenir. İletişim balonunun enabled, saat, cihaz veya sayfa filtreleri sipariş ayarını yönetmez.

Tek StorefrontCommercePolicy; fiyat görünürlüğü, sepete ekleme, yeni ödeme başlatma ve WhatsApp alıcısı kararlarını üretir. Sayfa oluşturma, bütün tema bileşenleri ve herkese açık API girişleri aynı kararı kullanır. Tarayıcıdan gelen gizle veya göster bilgisi yetki sayılmaz. Mağaza kimliği ve alan adı mevcut otoriteden çözülür; başka mağaza telefonuna veya politikasına geçilemez.

Başlıca kaynak alanları:

- apps/customer-panel/components/settings/StoreToolsConsole.tsx ve ilgili ayarlar sayfası.
- packages/saas-contracts içindeki merchant-admin, storefront ve ticari yetenek sözleşmeleri.
- packages/saas-data içindeki ayar doğrulama, kayıt, herkese açık mağaza ve Merchant uygunluk akışları.
- apps/owner/scripts/sql/saas altında yeni ve geriye uyumlu veri desteği.
- apps/storefront-shared/lib/page-context.ts ve default-runtime.ts; shared fiyat görünümü ve WhatsApp mesaj hazırlayıcısı.
- ProductCard, ProductPurchasePanel, ProductQuickView; Güzide, Siora, Lilyum ve Alpler tema karşılıkları.
- SideCartDrawer, SioraSideCartDrawer, CartPageClient, FreeShippingProgress, OrderBumpOffers ve ödeme girişleri.
- Arama, favoriler, katalog, sepet ve ödeme teklif API'leri; public-seo.ts ve fiyat taşıyan ziyaret olayları.

## Sunucu yükü

WhatsApp sohbeti kullanıcının tıklamasıyla açılır; otomatik toplu mesaj servisi veya sürekli sorgu eklenmez. Ayar aynı istekte bir defa okunup paylaşılır; her ürün için ayrı sorgu yapılmaz. Mevcut ürün medyası önbelleği korunur. Politika değişimi sonraki yanıt ve satın alma eyleminde güncel otoriteden uygulanır; eski tasarım önbelleğiyle kısıtlamanın kaybolmasına izin verilmez. Önceden açık sekmeler ve geri yüklenen sepetler için var olan yenileme noktalarında politika kontrol edilir; arka planda sürekli polling kurulmaz.

## Uygulama ve yayın sırası

1. Ortak veri ve public görünüm sözleşmelerini, yetkileri ve kapalı varsayılanı hazırlama.
2. Yeni sözleşmeleri anlayan uyumlu sunucu ve okuyucuları yayınlamadan önce izole veride doğrulama.
3. Ortak vitrinlerde bütün tema ve API tüketicilerini uyumlu hale getirme; fiyatlı eski yanıtların gizli modda kullanılamamasını doğrulama.
4. Mağaza araçları kartı, kaydetme, numara doğrulama ve mod önizlemesini tamamlama.
5. Merchant uygunluk ve geri çekme işlerini sürüm kontrolüyle bağlama.
6. İzole test mağazasında kabul; ortak NET ve SITE yayın düzeninde uyumlu bileşenleri tamamlama; ardından seçilen mağazada açma.
7. Kabul sonrası mevcut ve yeni mağazalarda paket ve rol kurallarına göre kullanılabilir yapma. Açma kapama varsayılanı yeni mağazada kapalıdır.

Karışık sürümler varken kısıtlayıcı ayarlar açılmaz. Geri dönüşte yeni etkinleştirmeler durdurulur; etkin bir fiyat gizleme kuralı eski okuyucuya dönülerek sessizce kaldırılmaz. Uyumlu sürüm korunur veya ilgili vitrin için güvenli hata davranışı uygulanır.

## Kısa ve hedefli kabul listesi

- Ana özellik kapalı ve dört alt kombinasyon; kaydetme, yenileme, çatışma ve belirsiz kayıt sonucu.
- Bütün ortak temalarda masaüstü ve mobil ürün, hızlı görünüm, arama, favoriler, yan sepet ve sepet sayfası.
- Tek ve çok varyant, adet seçimi, stok dışı veya silinmiş ürün, boş ve uzun sepet, Türkçe karakter ve alıcı numarası.
- Gizli fiyatın görünür metin, HTML, istemci verisi, JSON-LD ve ilgili herkese açık API'lerde bulunmaması.
- Doğrudan sepete ekleme ve yeni ödeme çağrılarının kurala uyması; mevcut son sepet ürününü silme davranışı.
- WhatsApp tıklamasının sipariş, tahsilat, prim veya stok hareketi yaratmaması; sepeti temizlememesi.
- Paket ve rol kontrolleri, başka mağazanın numara veya ayarına erişilememe, eski tarife görüntülerinin korunması.
- Merchant'a yeni uygunsuz gönderimin engellenmesi, var olan teklifin geri çekilmesi ve geri açınca aynı kimlikle yayınlanması.
- Başlamış gerçek ödemelerin tamamlanması, normal modda mevcut sepet ve ödeme akışının korunması.

Kısa otomatik sözleşme ve davranış testleri ile bir kontrollü tarayıcı kabulü yeterli başlangıç kapısıdır; yalnız bulunan somut risk için ek test açılır.
