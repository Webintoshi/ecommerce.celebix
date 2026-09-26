# Mağaza Satışı: sade kasiyer ekranı

**Tarih:** 2026-09-26

**Durum:** Konuşmada netleşen tasarım; yazılı incelemeye hazır. Ürün uygulaması ve canlı yayını henüz yapılmadı.

**Kapsam:** Paylaşılan Customer Panel, `/orders/quick-links` ekranından başlayacak mağaza satış akışı.

## 1. Amaç ve kabul edilen akış

Kasiyer ürünleri barkodla sepete ekler, gerekirse basit indirim uygular, ekranda görünen tutarı mevcut banka POS cihazına girerek tahsil eder ve Celebix'te ödemeyi aldığını belirtir. Celebix satışı kaydeder ve doğru mağaza/depo stok hareketini oluşturur.

Müşteriye ödeme bağlantısı gönderme bu satışın adımı değildir. Banka POS cihazından otomatik tahsilat veya banka doğrulaması bu sürümün kapsamına girmez. Fiziksel cihazdaki ödeme ile Celebix kaydı ayrı işlemlerdir; uygulama bu farkı satış yaşam döngüsüyle yönetir.

Normal satış yolu:

1. **Barkod okut / ürün ara.** Aynı varyant tekrar okutulursa adedi artar.
2. **Sepeti düzenle.** Adet değiştir, satır çıkar; gerekiyorsa yüzde veya TL indirim uygula.
3. **Ödemeye geç.** Sunucu tutarı doğrular, kalıcı satış kaydı ve stok rezervasyonu oluşturur.
4. **POS'a girilecek tutarı gör.** Kasiyer tutarı fiziksel cihazda tahsil eder.
5. **Ödemeyi aldım — Satışı tamamla.** Tek satış, ödeme beyanı ve stok hareketi kaydedilir.
6. **Yeni satış.** Başarı özeti gösterilir; barkod alanı tekrar kullanıma hazır olur.

## 2. Mevcut ekranın işlev envanteri

İncelenen Butik Siora ekranında ürün/varyant arama, adet değişimi, müşteri bilgileri, teslimat/fatura adresleri, kargo ve TL indirim alanı, bağlantı süresi, ödeme yöntemi, notlar ve ödeme bağlantısı geçmişi bulunuyor.

Mağaza satış ekranındaki karşılıklar:

| İşlev | Mağaza satışında karar |
| --- | --- |
| Ürün arama ve sepete ekleme | Barkod öncelikli arama; isim/SKU arama yedek yol |
| Adet değiştirme ve satır silme | Sepet satırında doğrudan erişim |
| TL indirim | Tek sepet indirimi; `% / TL` seçimi eklenir |
| Müşteri bilgileri | İsteğe bağlı, kapalı ayrıntı alanı; belge süreci gerektiriyorsa açılır |
| Teslimat ve kargo | Mağazadan teslim modeli; kargo ücreti sıfır |
| Ödeme adımı | Harici banka POS'unda manuel tahsilat ve kasiyerin ödeme beyanı |
| Notlar | İsteğe bağlı ayrıntı alanı |
| Bağlantı süresi / bağlantı geçmişi | Bu kasiyer akışının parçası olmaz |
| Yeni operasyon araçları | Sepeti beklet, bekleyen satışa dön, son satışlar |

Mevcut müşterilere gönderilmiş ödeme bağlantıları çalışmaya devam eder. Bağlantı oluşturma ve geçmişi gerektiğinde ayrı erişimde korunur; kasiyer ekranı iki satış yöntemini seçtiren bir başlangıç adımı içermez.

İncelemede ödeme yöntemleri ve bağlantı listesi hizmet hatası gösterdi. Kök neden henüz doğrulanmadı. Yeni mağaza satışının kullanılabilirliği PayTR/Iyzico bağlantı oluşturma hazırlığına bağlanmaz.

## 3. Ekran düzeni ve hız

### Masaüstü

- Üstte barkod/ürün arama alanı; ekran açılınca odak burada olur.
- Sol geniş alanda ürün sepeti: küçük görsel, ürün, renk/beden, birim fiyat, adet, satır tutarı, silme.
- Sağda sabit özet: **Ara toplam**, **İndirim**, büyük **Ödenecek tutar**, tek ana eylem.
- Depo bilgisi kısa ve görünürdür. Tek aktif satış deposu varsa otomatik seçilir; birden fazlaysa ödemeden önce seçilir.
- `İndirim`, `Sepeti beklet` ve `Son satışlar` ikincil eylemlerdir. Müşteri/not alanları kapalı ayrıntıda kalır.
- Ödeme adımında büyük tutar ve ödeme beyanı öne çıkar; sepet ve indirim salt okunur hale gelir.

### Dar ekran / 390 px

Arama üstte, sepet altında, toplam ve o anın ana eylemi altta sabittir. İndirim ve ayrıntılar kompakt panelde açılır. Sayfa yatay taşmaz. Masaüstü tablosu telefonda satır kartına dönüşür; toplam/eylem son ürünü örtmez.

### Etkileşim kuralları

- USB/HID barkod okuyucunun Enter ile tamamladığı okuma, barkod alanında tam eşleşme arar.
- Barkodlar metin olarak işlenir; baştaki sıfırlar korunur. Yeni 13 haneli iç barkodlarla birlikte kayıtlı tedarikçi ve geçmiş barkodları aranabilir.
- Tüm katalogda mağazaya ait tam barkod araması yapılır; ilk katalog sayfalarını indirip metin içinde aramak kullanılmaz.
- Tek eşleşme doğrudan eklenir; birden fazla eşleşme otomatik seçilmez. Bulunamayan barkod kısa mesajla gösterilir ve okutma alanı hazır kalır.
- Görsel geri bildirim zorunludur; kısa ses kapatılabilir. Ardışık gerçek okutmalar adedi artırır, tek okutmanın yeniden işlenen ağ yanıtı artırmaz.
- Barkod yakalama müşteri, indirim veya not alanlarına yazılan metni ele geçirmez. Dialog kapanınca odak önceki kontrolüne döner.
- Ekran içinde tekrarlanan büyük sayfa başlığı ve açıklama blokları olmaz. Erişilebilir başlık, açık etiketler ve mevcut Mira bileşenleri kullanılır.
- Bir aşamada bir ana eylem gösterilir: düzenlemede `Ödemeye geç`, tahsilatta `Ödemeyi aldım — Satışı tamamla`.

## 4. Basit indirim

### Kasiyerin gördüğü

`İndirim` eylemi küçük bir alan açar:

- Tür: **%** veya **TL**.
- Tek değer alanı; iki ondalık basamağa kadar giriş.
- Önizleme: **İndirim −₺200,00** ve **Ödenecek ₺1.800,00**.
- `Uygula` / `Kaldır`; uygulama sonrası özette `10% · −₺200,00` gibi düzenlenebilir kısa gösterim.

Örnek: ₺2.000 sepet için %10 indirim ₺200, ödeme ₺1.800 olur. Aynı sepete ₺150 TL indirim girilirse ödeme ₺1.850 olur. İki tür aynı anda uygulanmaz; tür değiştirilince önceki değer temizlenir, önizleme yeniden hesaplanır.

İlk sürüm tek sepet indirimi sunar. Satır başına indirim, serbest birim fiyat yazma, kupon oluşturma ve katmanlı indirim ekranları eklenmez. Adet/ürün değişince yüzde indirim yeniden hesaplanır; TL indirim aynı kalır. TL indirim yeni toplamı aşarsa sessizce azaltılmaz; düzeltme istenir ve ödeme başlatılamaz.

### Hesap ve kayıt

- Para tam sayı kuruş, yüzde tam sayı basis point olarak saklanır: %10 = 1000 bps.
- Yüzde indirim `floor(eligibleSubtotalCents × percentageBps / 10000)` ile hesaplanır; mevcut kampanya motorunun kuruş altını aşağı kesme kuralıyla tutarlıdır. Çarpımlar taşma olmadan tam sayı aritmetiğiyle yapılır.
- TL girişinde nokta/virgül açık biçimde normalize edilir; geçersiz biçim, negatif değer ve ikiden fazla ondalık reddedilir.
- İlk sürümde tüm ücretli ürün satırları indirim matrahıdır. Kargo, ücretsiz hediye veya tahsil edilmeyen tutar matraha eklenmez.
- `ürün ara toplamı − sepet indirimi = ödenecek toplam`. Harici POS tahsilatında toplam en az 1 kuruş olmalıdır. Sıfır tutarlı teslim ayrı bir işlem kapsamıdır.
- Yetkisiz miktar sunucuda reddedilir. Kasiyer için mağaza sahibinin verdiği yüzde tavanı uygulanır; TL indirim de aynı tavanın gerçek toplam üzerindeki karşılığıyla denetlenir. Yetki verilmeden kasiyer indirimi varsayılan olarak kapalıdır. Sahip/admin açık indirim yetkisine sahiptir; negatif/ücretsiz tahsilat sınırları herkes için geçerlidir.
- Limit aşımı aynı dialogda kısa açıklanır. Bu sürümde ayrı yönetici PIN akışı yoktur; yüksek indirim gerektiğinde yetkili kullanıcı satış kaydını denetimli devralır. Devralma ödeme başlamadan yapılır ve iki kullanıcı kaydedilir.
- Sunucu hesaplanan tutarın otoritesidir. Tarayıcıdaki önizleme ödeme hazırlığında doğrulanır; fark varsa kasiyer yeni toplamı görüp yeniden ödeme hazırlığı yapar.
- İndirim miktarı ürün satırlarına oransal, deterministik kuruş dağıtımıyla ayrıca atanır; dağıtım toplamı indirime eşittir. Mevcut `allocatePromotionDiscount` yardımcı fonksiyonunun doğrulanmış sıralama/kalan kuruş kuralı kullanılabilir.
- Aynı satırda birden fazla adet varsa indirim birimlere de tam kuruşla dağıtılır ve değişmez snapshot saklanır. Sonraki iadede ürünün o satışta ödenmiş net tutarı esas alınabilir.
- Orijinal fiyat, fiyat kaynağı, indirim türü/değeri, hesaplanan indirim, satır/birim dağıtımı, ödenen net, kasiyer ve zaman birlikte saklanır. Raporlar brüt / indirim / net tutarı ayrı verir.

### Ortak sipariş hesabına uyum

Mevcut manuel sipariş sözleşmesi hem satır indirimi hem başlık indirimi destekler; satır indirimleri zaten ara toplamdan düşülür. POS sepet indirimi iki yere düşüm olarak yazılmaz.

İlk sürümde ortak siparişin ürün satırları indirim öncesi tutarla yazılır, satır `discountCents` değeri bu sepet indirimi için sıfırdır. Sepet indirimi başlığın `discountCents` değerinde bir kez düşülür. Ayrı POS indirim snapshot'ı satırların/birimlerin ödenmiş net payını taşır; bu dağıtım yeniden başlık toplamından düşülmez. Sipariş, vergi/belge ve gelecekte iade gösterimleri aynı snapshot'ı kullanır. Eski siparişlerin toplam formülü değiştirilmez.

Mevcut ürün gelir raporu `order_items.line_total_cents` toplamını kullanıyor. POS satışlarında ürün geliri bu brüt satır toplamından snapshot'taki pay düşülerek hesaplanır. Sipariş/genel gelir ve ürün gelirinin toplamı aynı net tahsilatı vermelidir. Tamamlanmış manuel ödeme beyanı raporların ödeme kaynağına açıkça eklenir; banka doğrulaması olarak yeniden etiketlenmez. Henüz siparişe dönüşmemiş ödeme beyanı normal satış gelirine yazılmaz, ayrı bekleyen tahsilat olarak gösterilir.

### Kampanya ve fiyat politikası

Mağaza satışı ayrı `in_store` kanalıdır. İlk sürüm çevrim içi kupon/kampanyaları otomatik bu kanala taşımaz; indirim mekanizması açık sepet indirimidir. Mağaza satışında kampanya birleştirme sonraki kapsamdır.

Katalog fiyatı ile kupon/kampanya ayrıdır. `in_store` fiyat listesi kuralı tanımlanmışsa bu kanalın etkin fiyatı, yoksa ürünün geçerli taban fiyatı kullanılır. `quick_order` ya da `storefront` fiyat listesi kuralları sessizce kopyalanmaz. Referansla fiyatlanan ürünlerde mevcut kur/altın fiyatlama motoru zorunludur; güvenilir TRY teklifi üretilemeyen ürün için tahsilat başlatılmaz. İlk sürüm tek TRY satış toplamıdır.

## 5. Satış yaşam döngüsü

| Durum | Sepet/indirim | Stok | Kasiyer eylemi |
| --- | --- | --- | --- |
| Taslak / bekletilmiş | Düzenlenebilir | Rezervasyon yok | Devam et, beklet, sil |
| Hazırlanıyor | İstek tamamlanana kadar kilitli | Teklif/rezervasyon doğrulanır | Sonuç bekle |
| Tahsilat bekliyor | Fiyat ve indirim sabit | Aktif rezervasyon | Fiziksel POS'ta tahsil et; ödeme beyanını kaydet |
| Kontrol gerekiyor | Sabit | Rezervasyon korunur | Aynı kayıttan ödeme durumunu kontrol et |
| Ödeme beyanı alındı / kayıt tamamlanıyor | Değişmez | Rezervasyon korunur | Aynı satışı tamamla; yeniden ödeme alma |
| Tamamlandı | Değişmez | Rezervasyon tüketilmiş; fiziki stok düşmüş | Özeti gör, yeni satış |
| Ödeme alınmadı / iptal | Eski teklif geçersiz | Rezervasyon kontrollü serbest bırakılmış | Tekrar hazırlamak için taslağa dön |

Taslak sunucuda sürümlü saklanır; bekletmek satış veya stok rezervasyonu oluşturmaz. Bekletilen sepet açılınca fiyat ve stok yeniden değerlendirilir. Tarayıcı depolaması sunucudaki kalıcı satış kaydının yerine geçmez.

Ödeme hazırlığı kalıcı satış kimliği, kasiyer/depo bağlamı, sabit fiyat/indirim snapshot'ı ve ortak stok rezervasyonu oluşturur. Hazırlık başarılı olmadan fiziksel cihazda tahsilata geçiş gösterilmez.

`Ödemeye geç` sonrası ekran tahsilat bekliyor durumundadır. Banka işleminin başlayıp başlamadığını Celebix bilemediği için bu durumdaki rezervasyon bir zamanlayıcıyla kendiliğinden serbest bırakılmaz. Uzayan kayıt `Kontrol gerekiyor` listesine çıkar; kasiyer/sahip ödemeyi kontrol ederek devam eder veya ödeme alınmadığını beyan ederek iptal eder. Bu kontrol liste/hatırlatma, otomatik ücret veya banka talebi oluşturmaz.

Ödeme alınmadığında `Ödeme alınmadı — Sepete dön` eylemi kısa, açık teyitle eski teklifi iptal eder. Kasiyer yeniden hazırlayıp yeni tutarı tahsil eder. Ödeme alınmışken ürün/indirim değiştirilmez; yanlış tutar veya iptal kontrollü çözüm kaydına yönlendirilir.

`Ödemeyi aldım — Satışı tamamla` kullanıcı için tek eylemdir. Sunucu önce ödeme beyanını idempotent ve kalıcı kaydeder (`payment_received / completion_pending`), sonra sipariş/stok tamamlamasını çalıştırır. Tamamlama başarısız olsa bile sunucunun aldığı beyan kaybolmaz; aynı satış tekrar tamamlanır. Bu durumdan ödeme alınmadı beyanı, taslağa dönüş, fiyat değişikliği ve rezervasyon bırakma reddedilir. Sunucuya hiç ulaşmamış beyan ise otomatik alınmış sayılmaz; kasiyer fiziksel tahsilatı kontrol ederek aynı satışa beyanını gönderir.

Kasiyerin beyanı bankadan doğrulanmış tahsilat gibi etiketlenmez: ödeme yöntemi **Harici POS**, doğrulama kaynağı **Kasiyer beyanı**. Terminal/slip referansı isteğe bağlı ayrıntıdır; kart numarası veya banka güvenlik verisi alınmaz.

## 6. Stok, tahsilat ve yeniden deneme güvenceleri

- Online ödeme, mağaza satışı ve stok işlemleri aynı aktif rezervasyon hesabını görür. Sadece POS'a ait ayrı tabloda tutulan ve online satışın görmediği rezervasyon kabul edilmez.
- Mağaza satışı açıkça seçilmiş lokasyondan tüketilir. Mevcut genel stok değişimindeki “Ana Depo önce” davranışı POS'a taşınmaz; toplam stok ve lokasyon kaydı bir kez güncellenir.
- Örnek: fiziki 10, ödeme için ayrılmış 1, satılabilir 9, tamamlanmış satış 0. Tamamlama sonrası fiziki 9, ayrılmış 0, satılabilir 9, tamamlanmış satış 1.
- Celebix içindeki tamamlama sipariş + kalıcı ödeme beyanının siparişe bağlanması + rezervasyon tüketimi + stok hareketi + denetim kaydını tek veritabanı işlemiyle yazar. Ödeme beyanının önceki kalıcı kaydı tamamlama hatasında geri alınmaz. Fiziksel banka POS tahsilatı bu işlemlerin dışında kalır.
- Her hazırlık/tamamlama/iptal aynı satış kimliğine ve kalıcı işlem anahtarına bağlanır. Aynı istek aynı sonucu verir; farklı içerik aynı anahtarla kabul edilmez.
- Sonuç belirsizliğinde önce kalıcı işlem/satış durumu okunur, ardından aynı tamamlama yeniden denenir. İkinci sipariş veya ikinci stok hareketi oluşmaz.
- Ağ kesintisi veya oturum kapanması sonrasında yetkili kullanıcı bekleyen satış listesinde aynı kaydı bulur. “Tekrar ödeme al” talimatı verilmez; mevcut tahsilat kontrol edilir.
- Aynı kaydı iki kasiyer açarsa sürüm ve sahiplik kilidi tek işlem sahibini belirler. Yetkili devralma denetim kaydı oluşturur; iki başarılı tamamlama mümkün değildir.
- Kasiyerin üyeliği kapatılmış olsa da yetkili mağaza sahibi bekleyen satış ve ödeme beyanını devralıp çözer. Kapatılmış kullanıcı eski yetkileriyle işleme devam edemez.
- İlk sürüm taslakları kalıcı silmez; ürünler çıkarılarak aynı taslak düzenlenir veya sepet bekletilir. Ödeme alınmadı onayı ayrılmış stoğu bırakıp aynı sepeti düzenlenebilir taslağa döndürür. Kalıcı taslak silme ayrı bir sonraki kapsamdır; tahsilat/beyan/rezervasyon kayıtları bu akışla silinmez. Mevcut ortak sipariş kalıcı silme politikası uygulandığında sipariş bağı kontrollü ayrılır; tamamlanmış satışın asgari idempotency/tombstone kaydı korunur. Eski tamamlama isteği “tamamlanmış, sipariş silinmiş” sonucuna döner; yeni sipariş veya stok hareketi üretmez. Kişisel veri temizliği mevcut silme politikasıyla yürütülür.
- Son ürün başka kanalda tüketilmişse hazırlık tahsilattan önce reddedilir. Hazırlıktan sonraki stok sayımı/düzeltmesi aktif rezervasyonları geçersiz kılıp sessiz satışa izin vermez; çakışma kontrollü çözüm gerektirir.

## 7. Sipariş ve yetki modeli

- Yeni satış kaynağı `in_store`; mevcut genel sipariş geçmişinde `Mağaza satışı` olarak ayırt edilir.
- Teslimat `in_store` / mağazadan teslim olarak kaydedilir. Tamamlama başarılı olunca sipariş ödenmiş ve mağazadan teslim edilmiş olur; kargo bekleyen sipariş oluşturulmaz.
- Kimliksiz mağaza müşterisi gerçek bir modeldir. İsim/email/adres için uydurma müşteri kayıtları üretilmez. Ortak sipariş sözleşmesindeki zorunlu alanlar bu model için açıkça genişletilir; geçmiş web siparişleri aynı kurallarda kalır.
- Mevcut mali belge/ÖKC/e-belge süreci satışın gerçek ödeme ve indirim snapshot'ını kullanır. Panelde satış özeti göstermek kendi başına banka veya mali belge düzenleme entegrasyonu sayılmaz; mevcut belge akışı pilot hazırlığında doğrulanır.
- Kasiyer yalnız atandığı mağaza/lokasyonda arama, taslak, ödeme hazırlığı ve ödeme beyanı yapabilir. Genel yönetici yetkisi verilmez.
- İndirim, başkasının satışını devralma, ödeme belirsizliği çözümü ve iade ayrı sunucu izinleridir. Arayüzde düğme gizlemek yetki kontrolünün yerine geçmez.
- Tenant, kullanıcı ve yetki mevcut sunucu oturumundan türetilir; istemci gönderdiği mağaza/kullanıcı ile yetki kazanamaz.
- Günlük özet harici POS tahsilatı, indirim, net satış ve bekleyen kontrol kayıtlarını gösterir. Harici POS gün sonuyla karşılaştırma manueldir; “banka ile otomatik mutabakat” iddiası yapılmaz.

## 8. Teknik uygulama sınırı ve yeniden kullanım

Yeni akış ayrı mağaza satış sözleşmesi/runtime/repository üzerinden oluşturulur. Mevcut quick-link müşteri, adres, provider ve link-redemption zorunluluklarını sahte bilgilerle aşmaz. Ürün kartları, para girişi, arama/sepet bileşenleri, sürüm/idempotency kalıpları, fiyatlama ve dağıtım yardımcıları yeniden kullanılır.

İlgili mevcut temeller:

- `apps/customer-panel/components/orders/QuickOrderLinksConsole.tsx`: mevcut envanter ve sepet etkileşimleri.
- `apps/customer-panel/lib/quick-link-ui/client.ts`: mevcut katalog aramasının sayfa sınırı ve barkod eşleşmesi; tam barkod servisi gerekir.
- `packages/saas-contracts/src/orders/{types,validation}.ts`: mevcut satır/başlık indirimi ve müşteri zorunlulukları.
- `packages/saas-contracts/src/pricing/types.ts`: mevcut kanallar `storefront`, `quick_order`; yeni kanal açıkça eklenir.
- `packages/saas-contracts/src/promotions/types.ts` ve `packages/saas-data/src/promotions/allocation.ts`: tam sayı yüzde ve dağıtım temelleri.
- `packages/saas-data/src/orders/repository.ts`: sürüm kontrolü ve belirsiz commit sonrası kalıcı sonuç okuma.
- `apps/owner/scripts/sql/saas/202608010078_manual_order_drafts.up.sql`: mevcut manuel sipariş atomik yazım kalıpları.
- `202607220026_quick_order_checkout_runtime.up.sql` / `202607220027_quick_order_checkout_api.up.sql`: rezervasyon ve online satılabilir stok; POS ile aynı hesabı görmeleri zorunlu.
- `202607220043_inventory_purchasing.up.sql`: lokasyon stok davranışı; POS lokasyon tüketimi ayrı doğrulanır.
- `202609030124_commerce_analytics_cart_recovery.up.sql`: ürün gelirinin mevcut brüt satır toplamı; POS indirim snapshot'ı ve tamamlanmış manuel tahsilat kaynağıyla uyarlanır.
- `202609200132_reference_pricing_checkout.up.sql` / `202609200134_reference_pricing_manual_order_guards.up.sql`: fiyat teklifi ve referans fiyatlı ürünlerin mevcut koruması.

Ortak sipariş/fiyat/yetki sözleşmeleri, storefront satılabilir stok hesabı, owner kontrollü SQL ve paylaşılan panel birlikte ele alınır. API/SQL değişikliği görsel düzenleme gibi yayımlanmaz. Uygulama planı kesin dosya, migration, dağıtım ve geri alma sırasını belirler.

## 9. İlk sürüm sınırı

İlk sürüm: barkod ve isim/SKU arama, adet/silme, tek yüzde/TL sepet indirimi, isteğe bağlı müşteri/not, depo seçimi, sunucuda bekletme, ödeme hazırlığı, harici POS ödeme beyanı, güvenli tamamlama/iptal/kurtarma, son satışlar ve basit günlük toplamlar.

Sonraki kapsam: bölünmüş ödeme, nakit/para üstü, doğrudan banka POS bağlantısı, çevrim dışı tamamlanmış satış, mağaza kampanya/kupon birleştirme, ayrı yönetici PIN onayı, gelişmiş iade/değişim ekranı. İlk sürüm ödenmiş satır/birim snapshot'larını saklar; gelecekte iade hesabı katalogdaki yeni fiyatı kullanmaz.

## 10. Kabul ve pilot kontrolleri

1. Kataloğun ilk sayfalarında olmayan ürün barkodla bulunur; yanlış tenant ürünü dönmez; baştaki sıfır kaybolmaz.
2. İki gerçek okutma adedi iki yapar; tek isteğin yanıtı tekrar işlendiğinde adet ikiye çıkmaz. Bedeni/rengi yanlış varyant otomatik seçilmez.
3. ₺2.000 / %10 → ₺1.800; ₺2.000 / ₺150 → ₺1.850; %0,01 ve kuruş sınırlarında tek deterministik sonuç.
4. Negatif/limit aşımı, toplamı aşan TL, iki kez indirim düşme ve ödeme sırasında fiyat/indirim değişimi engellenir. Satır/birim dağıtımları tam toplamı korur.
5. Etkin fiyat, taban fiyat ve referans fiyat teklifi aynı yetkili motorla doğrulanır; web kampanyası mağaza satışına sessizce eklenmez.
6. Son ürün için online/POS eşzamanlı yarışında en fazla bir rezervasyon başarılı olur; lokasyon ve toplam stok bir kez düşer.
7. POS tahsilatı sonrası ağ kesintisi, oturum kapanması, belirsiz commit ve çift tıklama aynı satışa döner; kullanıcı yeniden tahsilata yönlendirilmez.
8. Uzayan tahsilat rezervasyonu otomatik serbest bırakılmaz; ödeme alınmadı beyanı ve yetkili çözüm denetlenebilir.
9. Yetkisiz kullanıcı doğrudan servis çağrısıyla indirim, depo değiştirme veya başka kasiyerin satışını tamamlama yapamaz.
10. Kimliksiz satış sahte email/adres oluşturmaz; sipariş geçmişi mağazadan teslim ve harici POS beyanını doğru gösterir.
11. 1440/1024/390 px, klavye/odak, loading/empty/error, ağ/console davranışı ve mevcut gönderilmiş linklerin çalışması doğrulanır.
12. Ortak panelden önce kontrollü Butik Siora pilotu, gerçek depo/fiyat ayarları ve harici POS/belge günlük kontrolü tamamlanır. Ardından mağaza bazında etkinleştirilir. Başka fiyat modeli olan mağazada güvenilir teklif ve stok kontrolleri geçmeden açılmaz.
13. Ödeme beyanı kayıtlıyken stok/sipariş tamamlaması başarısız olursa beyan korunur; alınmadı/iptal yoluna dönmez. Kapatılmış kasiyerin satışını yetkili sahip kurtarır. Sipariş silindikten sonra eski tamamlama ikinci satış yaratmaz.
14. İndirimli POS satışında ürün geliri toplamı ve sipariş net geliri aynıdır; tamamlanmamış tahsilat normal gelirden ayrı gösterilir.

## 11. Tasarım inceleme sonucu

Konuşmadaki manuel POS ve basit indirim gereksinimleri tek normal satış yoluna yerleştirildi. Normal ekranda üç ana bölüm ve bir ana eylem vardır; yetki ve kurtarma kontrolleri ihtiyaç oluştuğunda görünür. İndirim tek kez düşülür, ödeme öncesi toplam sabitlenir ve belirsiz tahsilat otomatik iptal edilmez. Bu belge tasarımdır; POS özelliğinin uygulandığı veya canlıya alındığı anlamına gelmez.

## İlk sürüm kapsamı kararı

Yeni çalışan kimliği daveti ve doğrulanmış SaaS üyeliğine kasiyer rolü atama bu sürümde yapılmaz. Mevcut mağaza sahibi/admin hesapları kasayı kullanabilir; önceden doğrulanmış kasiyer üyeliğinin depo ve indirim yetkileri düzenlenebilir. Eski yönetici daveti formu kimlik bağlamadığı için yeni kasiyer daveti gibi sunulmaz.
