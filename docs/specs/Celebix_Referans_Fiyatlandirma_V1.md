# Celebix — Referans Bazlı Ürün Fiyatlandırması V1

**Durum:** Ürün ve teknik tasarım önerisi. Kod değişikliği, veri değişikliği ve yayın yapılmadı.
**Amaç:** Mağaza sahibinin kendi girdiği TL, USD, EUR ve gram altın referanslarıyla ürün/varyant fiyatlarını yönetmesi; fiyatın katalog, sepet ve siparişte tutarlı olması.
**Örnek pilot:** Güzide Kuyumcu. Mimari tüm tenant’lara uygun olacak, Güzide’ye özel kod içermeyecek.
**İncelenen kaynak:** Webintoshi/ecommerce.celebix — c09d59a21944fb24ef82cf904db5e444ec1d4fd5.
**Belge kapsamı:** İlk sürümün davranış kuralları, veri sınırları, geliştirme sırası ve kabul senaryoları. Buradaki önerilen model adları mevcut sınıflar varmış gibi yorumlanmamalı.

## 1. Kullanıcı gereksinimi ve önerilen varsayılanlar

Kullanıcı ürün fiyatlandırmasında Türk lirası, dolar, euro veya gram altın seçebilmek istiyor. Gram altına bağlı üründe mağaza sahibi gram altının TL karşılığını kendisi girecek; ürünün gram miktarıyla çarpılarak fiyat bulunacak.

Önerilen ilk sürüm:
- Referanslar mağazaya özel ve MANUEL olacak.
- Ürün/varyant fiyat temeli: sabit TL, USD tutarı, EUR tutarı veya gram altın.
- Müşteriye gösterilen ve tahsil edilen para birimi ilk sürümde TRY olacak.
- Fiyatın USD’ye bağlı olması, ödeme sağlayıcısına USD gönderilmesi anlamına gelmeyecek.
- Mevcut sabit fiyatlı ürünler değişmeyecek.
- Manuel referans, mağaza sahibi yenileyene veya açıkça pasife alana kadar geçerli olacak. Son güncelleme zamanı görünür olacak.
- Otomatik kur/altın API’si ilk sürümün zorunlu bağımlılığı olmayacak.
- Mağaza sahibi referans fiyatı güncelleyince yalnız ona gerçekten bağlı güncel fiyatlar değişecek. Kesinleşmiş sipariş ve ödeme tutarları değişmeyecek.

Bu belge yeni bir ticari tarife önermez. Örnek tutarlar gerçek piyasa fiyatı değildir; işletmenin gireceği değerler kendi ticari kararıdır.

## 2. İncelenen mevcut altyapı

Kaynakta doğrulananlar:
1. `packages/saas-data/src/catalog/types.ts`: varyantlarda `priceCents`, `compareAtCents`, `costCents`; ürün düzeyinde `currency`.
2. `packages/saas-contracts/src/pricing/types.ts`: `PriceList`, `EffectivePrice`, `PriceSourceKind` (`base`, `price_list`); storefront ve quick_order kanalları.
3. `packages/saas-data/src/pricing/repository.ts`: tenant/yetki bağlamı, fiyat listesi save/activate/archive/preview, expectedVersion, operation fingerprint ve belirsiz commit sonrası recovery.
4. `packages/saas-data/src/storefront-commerce/types.ts`: cart/quote/quoteV2/completeV2 akışları; quoteV2 yanında authorityDigest.

Bu inceleme, manuel döviz ve gram altın fiyatlandırmasının uçtan uca mevcut olduğunu kanıtlamıyor. Başka doğrulanmış bir uygulama bulunursa yeniden kullanılmalı; hafızadaki veya eski branch’teki bir motor mevcut canonical’a aitmiş gibi kabul edilmemeli.

Yeni özellik mevcut fiyat listesi, canonical checkout, yetkilendirme, indirim ve sipariş geçmişi düzenini genişletecek. Ayrı, rakip bir fiyat motoru veya browser-authoritative hesap oluşturulmayacak.

## 3. Üç farklı kavram

1. **Fiyat temeli:** Satış fiyatının hesabında kullanılan birim/tarife.
2. **Hesaplanan satış fiyatı:** Geçerli kur/tarifeyle bulunan TL fiyat.
3. **Maliyet:** İşletmenin tedarik/muhasebe bilgisi; satış referansı otomatik olarak maliyet kabul edilmeyecek.

Gram altın referansı para birimi kodu değildir. Ürünün mevcut satış para birimini USD/EUR veya “Gram Altın” yaparak dönüşüm taklit edilmeyecek. Tarife birimi ayrıca tutulacak.

Mağaza sahiplerinin alış/satış fiyatları ayrı olabilir. V1’de hesapta kullanılan alan açıkça “Mağaza satış referansı” olarak adlandırılacak; alış/satış karışıklığına izin verilmeyecek. Gerçek alış fiyatı ve stok değerlemesi bu özelliğin dışında kalacak.

## 4. Mağazaya özel referans ekranı

Önerilen konum: Ayarlar → Fiyatlandırma → Kur ve Altın Referansları.
Mevcut navigation’da eşdeğer ekran varsa onunla bütünleşecek.

İlk alanlar:
- USD: 1 USD = mağazanın girdiği TL.
- EUR: 1 EUR = mağazanın girdiği TL.
- Gram altın: 1 gram seçilen tarife = mağazanın girdiği TL.
- TRY: sabit 1; düzenlenebilir kur alanı değildir.

Gram tarifeleri adlandırılabilir: “Gram altın satış”, “22 ayar gram satış” gibi. Her tarifede fiyatlanan gramın anlamı açık olacak. Tarife adını veya saflık temelini değiştirmek, kayıtlı fiyatı sessizce farklı anlama dönüştürmeyecek; yeni tanım/sürüm gerektirecek.

Her referansta kaynak=manuel, değer, birim, son güncelleme zamanı, güncelleyen yetkili, sürüm ve kullanım durumu bulunacak. Tam kullanıcı kimliği kamuya açılmayacak.

İş akışı:
Düzenle → Etkiyi önizle → Onayla ve uygula.

Önizleme:
- Etkilenen ürün ve varyant sayısı ayrı.
- Eski/yeni fiyat ve değişim oranı.
- Sabit TL fiyat listesiyle üzeri yazıldığı için fiilen etkilenmeyenler.
- Hesaplanamayan, üst sınıra taşan veya pasif kaynaklı varyantlar.
- Büyük değişiklik için belirgin ek teyit. Eşik işletme politikasıyla tanımlanır; uyarı ticari fiyat belirlemez.

Etkilenen bütün kayıtlar sayılmadan ilk sayfanın adedi toplam gibi gösterilmez. Büyük kataloglarda önizleme sayfalı olur. Uygulama anında aynı sürüm ve bağımlılık kapsamı yeniden doğrulanır.

İki kişi aynı referansı düzenlerse eski expectedVersion yeni kaydı ezemez. Aynı operation ID’nin tekrarı ikinci yayın oluşturmaz.

## 5. Ürün/varyant ekranı

“Fiyatlandırma yöntemi”:
- Sabit TL.
- Dolar bazlı.
- Euro bazlı.
- Gram altın bazlı.

Sadece seçilen yöntemin alanları görünür:
- Sabit TL: mevcut satış fiyatı.
- USD/EUR: baz satış tutarı ve mağaza referansı.
- Altın: hesaplama gramı, tarife, isteğe bağlı işçilik ve ek fiyat yüzdesi.
- Her yöntemde açıklanabilir TL hesap önizlemesi ve kullanılan referans sürümü.

Ürün modeli varyant bazında desteklenecek. Farklı gramajdaki yüzük/bilezik varyantları tek ürün gramıyla fiyatlandırılmayacak. Varyantın seçilmesiyle doğru gram ve fiyat kullanılacak.

Fiyatlandırma gramı, kargo ağırlığı ve envanter miktarı farklı alanlardır. V1’de satış miktarı adet, birim fiyat hesaplama ağırlığı gram olabilir; adet ile gram iki kez çarpılmayacak.

Değişken gerçek gramajlı her fiziksel parça için doğru varyant/tekil stok kaydı gerekir. “Yaklaşık gram” üzerinden sipariş alıp sonradan sessiz ek tahsilat yapılmaz. Teslimde tartılan değişken fiyatlı satış ayrı kapsamdır.

Eski ürün/varyantları toplu olarak altın/döviz moduna çevirme. Mod geçişi açık kullanıcı işlemi ve önce/sonra fiyat önizlemesiyle yapılır.

## 6. Hesaplama sözleşmesi

V1 varsayılanları: işçilik yok, ek fiyat yüzdesi 0, son satış birim fiyatında mevcut TRY kuruş hassasiyeti.

### 6.1 Sabit TL
Baz fiyat = girilen TL fiyatı.

### 6.2 Döviz
Baz fiyat TL = baz satış tutarı × ilgili para biriminin TL referansı.

Kurgusal örnekler:
- 125 USD × 40 TL/USD = 5.000 TL.
- 100 EUR × 45 TL/EUR = 4.500 TL.

Kaynak USD tutarı kur güncellenince değişmez; yalnız TL sonucu değişir.

### 6.3 Doğrudan gram tarifesi
Altın bileşeni TL = hesaplama gramı × seçilen gram satış tarifesi.

Kurgusal örnek:
2,500 g × 5.000 TL/g + 750 TL sabit işçilik = 13.250 TL.

Tarife 5.200 TL/g olursa aynı ürün:
2,500 × 5.200 + 750 = 13.750 TL.

Mağaza sahibi zaten 22 ayar gram satış tarifesi giriyorsa, fiyata tekrar 22/24 uygulanmaz. Bu doğrudan tarifeye ayar indirimi otomatik eklenmez.

### 6.4 Saflık dönüşümü: açık ileri seçenek
Bu bölüm basit kullanım için zorunlu değil. İleri seçenek açıkça seçildiğinde:

Altın bileşeni =
hesaplanan metal gramı × (ürün saflığı / referansın saflığı) × referans TL/gram.

Saflıklar aynı ölçekte ve kayıtlı gerçek tanıma göre kullanılır. “24 ayar” etiketinden körlemesine 1000, 999.9 veya 995 varsayılmaz. Ürün beyanı ve tarife tanımı kontrol edilir.

Taş/altın dışı ağırlık altın gramına dahil edilmez. Kullanıcı brüt ve taş ağırlığı giriyorsa negatif veya tutarsız metal gramı reddedilir. Doğrudan net metal gramı girişi de açık adla desteklenebilir.

Bu ileri seçeneğin kabulü, gerçek referans safiyeti ve ürün saflığının açıkça tanımlanmasına bağlıdır. Belirsiz ayardan fiyat üretme.

### 6.5 İşçilik ve ek fiyat
V1 işçilik seçenekleri:
- Yok.
- Bir adet ürün için sabit TL.
- Bir adet ürünün hesaplama gramı başına TL.

İşçilik tipi tek seçim olacak; aynı bedel iki kez uygulanmayacak.

Ek fiyat yüzdesi ileri alanda ve varsayılan 0 olacak:
Hesaplanan baz satış fiyatı = altın/döviz bileşeni × (1 + ek fiyat yüzdesi / 100) + işçilik.

Yüzdenin uygulandığı tutar ekranda yazacak. Bu, muhasebesel “net kâr marjı” iddiası değildir. İşçilik üzerinden ayrıca yüzdelik hesap istenmesi sonraki kapsamdır.

V1’de serbest JavaScript/SQL/Excel formülü, eval veya kullanıcının yazdığı executable ifade yok. Yalnız tanımlı parametreli hesaplama kullanılır.

## 7. Mevcut fiyat listeleri, indirimler ve vergi

Önerilen sıra:
1. Varyantın sabit/referans baz fiyatını çöz.
2. Mevcut kanal/müşteri fiyat listesi önceliklerini uygula.
3. Mevcut indirim/kupon uygunluk ve çakışma kurallarını uygula.
4. Mevcut vergi/kargo/toplam motoru ile nihai quote’u oluştur.

Mevcut sabit TL fiyat listesi override’ı döviz/altın referansıyla tekrar çarpılmaz. Kullanıcıya “Bu kanalda sabit fiyat listesi geçerli; kur değişimi bu satış fiyatını değiştirmiyor” açıklaması verilir.

Eski sabit ürünlerin kupon/indirim davranışı değişmez. Yeni gram altın moduna alınan ürünlerde indirim uygunluğu açık seçilir; önerilen varsayılan indirim hariçtir. Tüm tutara indirim ancak yetkili kullanıcı bilerek açarsa uygulanır.

“Yalnız işçilikten indirim” için bileşen bazlı motor desteği yoksa V1’de sahte seçenek gösterilmez. Ayrı ikinci aşama olarak tutulur.

Önceki fiyat/compare-at alanını güncel referansla otomatik değiştirip sahte indirim oluşturma. Çizili fiyatın kaynağı ve mevcut gösterim kuralları korunur.

KDV, kuyumculukta özel matrah ve fatura davranışı bu belgeyle varsayılmaz. Fiyat motoru vergi öncesi/sonrası sözleşmeyi mevcut sistemle tutarlı kullanmalı; ihtiyaç duyulan kuyumculuk vergi davranışı doğrulanmamışsa ticari satış kabulünde açık kapı olarak kalır. “Fiyat doğru” sonucu vergi/fatura sertifikası yerine geçmez.

## 8. Referans yayınlama, cache ve geçerlilik

Bir oran düzenlemek otomatik canlı yayın değildir. Taslak referans seti ve aktif değişmez sürüm ayrılır.

Aktivasyon, tamamlanmış bir referans sürümüne işaret eden aktif sürümü tek transaction ile değiştirir. Bir checkout hesabı eski USD + yeni altın gibi karma set kullanamaz.

Her değişiklik, eski değerleri değiştirmek yerine yeni audit/sürüm üretir. Geri alma, eski değerlerden yeni sürüm yayınlama olarak çalışır; eski siparişler değiştirilmez.

Aktif manuel fiyat için varsayılan: kullanıcı değiştirene kadar geçerli. Kaynak “anlık piyasa fiyatı” diye sunulmaz. Son güncelleme zamanı gösterilir. Otomatik sağlayıcıya ait kısa timeout/TTL manuel fiyata körlemesine uygulanmaz.

Eksik, negatif, sıfır veya açıkça pasif/süresi dolmuş gerekli referansta:
- Kur=1 veya fiyat=0 varsayılmaz.
- Sadece gerçekten o referansa bağlı yeni fiyat/checkout engellenir.
- Son eski değer izinsiz fallback yapılmaz.
- Sabit TL ve bağımsız diğer ürünler etkilenmez.
- Anlaşılır “fiyat güncelleniyor / satışa geçici kapalı” durumu gösterilir.

Liste, ürün detayı, kategori filtre/sıralaması, hızlı sipariş, sepet ve checkout aynı efektif fiyat tanımını kullanır. SQL’de sıralama/filter/pagination uygulanmadan önce doğru fiyat çözülür; yalnız ekrandaki satırların sonradan fiyatını değiştirmek yeterli değildir.

Cache anahtarları/güncellik sinyalleri tenant, aktif fiyat sürümü ve ilgili politika sürümünü kapsar. Genel Redis flush yapılmaz.

Tarayıcıda önceden açık sayfanın bir anda değişmesi garanti edilmez; sonraki okumada doğru sürüm ve ödeme öncesi yeniden teyit esastır. Search/feed gibi ayrı tüketiciler varsa güncelleme etkisi ve gecikmeleri raporlanır.

## 9. Sepet, ödeme ve siparişin fiyat bağlama noktası

Referans fiyatı ödeme tamamlanana kadar her istekte rastgele yeniden hesaplanmaz.

Önerilen bağlama:
- Sepetteki henüz kesinleşmemiş tutar, değişen referans/politika karşısında yeniden değerlendirilir.
- Quote üretilirken fiyat sürümü, varyant politikası ve nihai tutar mevcut authorityDigest/quote bağlamına dahil edilir.
- Quote görüntülendikten sonra referans değişmişse, ödeme başlatmadan önce güncel tutar gösterilir; müşteri yeniden onaylar. Eski tutarla sessiz tahsilat ya da yeni tutarla habersiz tahsilat yapılmaz.
- Ödeme girişimi mevcut sistemin atomik, yetkili başlangıç adımında bağlanınca o girişimin fiyat snapshot’ı sabitlenir.
- Bu noktadan sonraki referans güncellemesi devam eden gerçek ödeme tutarını değiştirmez.
- Timeout/replay/callback aynı sabit tutar ve işlem kimliğiyle çalışır; ikinci ödeme isteği üretilmez.
- Havale/kapıda ödeme siparişi oluşturulduğunda da mutabık kalınan tutar saklanır. Sonraki kur değişimi siparişi yeniden fiyatlamaz. Ödeme vadesi ve geç ödeme mevcut lifecycle kapsamında kalır.
- İade/değişim değerlendirmesi bugünün altın değerini eski tahsilata uygulamaz; eski gerçek ödeme ve satır snapshot’ı esas alınır. Yeni bir değişim/satış işlemi ayrı değerlendirilir.

Var olan quote/ödeme süre sınırları korunur; yeni süre seçimi gerekiyorsa aynı akışta açık politika olarak tanımlanır. Gecikmiş gerçek ödeme callback’i yalnız güncel kur değişti diye reddedilip tahsilat kayıtsız bırakılamaz.

## 10. Snapshot ve veri modeli sorumlulukları

Önerilen kavramsal varlıklar; mevcut modellerle eşleştirilerek adlandırılacak:
- Mağaza referans tanımı: birim, yön, altın tarife/saflık tanımı.
- Referans seti sürümü: değerler, oluşturma/aktivasyon zamanı, yetkili actor, durum.
- Varyant fiyat politikası: yöntem, kaynak miktarı/gram, referans kimliği, işçilik, ek yüzde, sürüm.
- Çözülmüş fiyat izi: kullanılan sürümler, ara bileşenler, yuvarlama ve final TL.
- Sipariş/ödeme snapshot bağı: değişmez fiyat izi + mevcut indirim/vergi/toplam bağları.

Tam snapshot en az şunları açıklayabilmeli:
“Bu varyant, şu gram/miktar ve şu mağaza referans sürümüyle; şu işçilik/ek yüzde/yuvarlama/fiyat listesi sonucunda bu TL tutara satıldı.”

Ticari maliyet, ek yüzde ve merchant-only audit bilgileri müşteriye varsayılan olarak açılmaz. Müşteri final satış fiyatını ve gerekli ürün bilgisini görür.

## 11. Sayısal doğruluk

Hesap ara değerlerinde binary floating point kullanılmayacak. Mevcut güvenilir exact decimal/fixed-point yaklaşımı varsa yeniden kullanılacak.

Önerilen hassasiyet:
- Döviz/altın referansları: en az 8 ondalık hane.
- Gram/miktar: en az 6 ondalık hane.
- Nihai TRY: mevcut kuruş tam sayı sözleşmesi.
- İşlem sınırları ve taşma kontrolleri: mevcut API/satış üst sınırlarıyla tutarlı.

Ara adımlarda kuruşa yuvarlama yapılmayacak. Fiyat birim seviyesinde bir kez tanımlı kuralla oluşur; adet çarpımı, indirim/vergi dağıtımı mevcut para aritmetiğiyle yapılır.

Varsayılan yuvarlama mevcut davranışı korur; mevcut kural yoksa negatif olmayan satış fiyatında yarım kuruşu yukarı alan açık kural önerilir. Ticari 1/5/10 TL adım yuvarlamaları ancak açık ayarla ve sipariş izinde kural sürümüyle uygulanabilir.

Türkçe 2,5 ve 5.000,50 girişleri açık locale kuralıyla parse edilir. Belirsiz binlik/ondalık gösterimleri sessiz yanlış değere çevrilmez. API canonical decimal-string biçimi kullanır; NaN/Infinity/scientific notation ve üst sınır kontrolü nettir.

## 12. API ve eski istemci uyumu

Tüm yönetim işlemleri mevcut TenantContext, actor yetkisi, expectedVersion ve operation-id düzenini koruyacak. Root DB erişimi merchant yetkisi yerine kullanılmaz.

Kur güncelleme yetkisi normal ürün düzenleme yetkisinden ayrı değerlendirilmeli; mevcut izin sistemi içindeki uygun fiyatlandırma/configuration yetkisine bağlanmalı.

Eski istemciden yalnız ürün başlığı veya stok güncellemesi gelmesi yeni fiyat politikasını silmemeli. Eski priceCents alanı bir referans bazlı ürünün politikasını sessizce sabit TL’ye çevirmemeli.

İçe aktarma/export fiyat temeli, kaynak miktarı ve referans bağını korumalı. Dinamik ürüne düz fiyat yazan dış entegrasyon için açık çakışma/izin davranışı gerekir; last-write-wins ile fiyat motoru geçersizleştirilmez.

Yeni çıktı alanları ve strict parser/export allowlist’leri tüketicilerle birlikte test edilir. Global validator gevşetilmez.

## 13. Asgari kabul senaryoları

### Temel hesap
- Sabit TL kur değişiminden etkilenmez.
- USD/EUR örnekleri beklenen TL sonucunu verir.
- 2,500 g × 5.000 + 750 = 13.250; referans 5.200 olduğunda 13.750.
- Doğrudan 22 ayar satış tarifesine ikinci saflık indirimi uygulanmaz.
- İleri saflık modunda farklı referans/ürün saflığı doğru oranla çözülür.
- Taş/kargo ağırlığı altın gramına karışmaz.
- Adet ve gram tekrar çarpılmaz.
- Sabit/per-gram işçilik ve sıfır ek yüzde doğru çalışır.
- Locale, yuvarlama sınırı ve taşma reddi doğrulanır.

### Yönetim ve fiyat listesi
- Güzide referansı diğer tenant’ı etkilemez.
- Yetkisiz kullanıcı değişiklik yapamaz.
- Stale expectedVersion reddedilir.
- Aynı operation retry ikinci yayın oluşturmaz.
- Önizleme kayıt/aktivasyon yapmaz.
- Sabit fiyat listesi override’ı tekrar dövize çevrilmez.
- Liste sıralaması/filtre ve sayfalama efektif fiyatı kullanır.
- Eksik/pasif referans etkilenen ürünlerde kontrollü unavailable üretir, 0 TL satış olmaz.
- Eski ürün editörü referans politikasını silemez.
- İlk geçişte mevcut sabit ürünlerin fiyatı/davranışı değişmez.

### Sepet ve ödeme
- Güncel fiyat PDP/katalog/sepette aynı sürüm bağlamında eşleşir.
- Kur yayınlama ile checkout başlatma yarışı eski veya yeni tek tutara seri bağlanır.
- Quote değişirse müşterinin yeniden teyidi gerekir.
- Bağlanmış ödeme attempt’i sonraki kurdan etkilenmez.
- Callback/replay çift ödeme/sipariş üretmez.
- Havale siparişi ve geçmiş sipariş snapshot’ları değişmez.
- İade hesabı mevcut gerçek ödeme snapshot’ını kullanır.
- İndirim ve vergi motoruna doğru fiyat bileşeni gider; ikinci indirim/çarpım oluşmaz.

### Kanıt
Gerçek migrations/roles/FK ile disposable PostgreSQL testleri; gerçek hesap/quote yolları ve kontrollü provider transport’u. Yetki fonksiyonunu her zaman başarılı yapan mock, gerçek tenant güvenliği kanıtı değildir. Gerçek merchant/provider çağrısı yapılmaz.

## 14. Kodlama sırası ve sahiplik

### Atlas — fiyatlandırma altyapısı ve ticari tutarlılık
1. Mevcut fiyat çözümleyicisi ve quote/snapshot bağlarını dosya/fonksiyon düzeyinde bir kez eşleştir. Yukarıda doğrulanan fiyat-listesi kodunu yeniden yazma.
2. Kesin sözleşme, exact aritmetik, referans sürümü ve varyant politikasını uygula.
3. Referans taslak/etki önizleme/aktivasyon/audit akışını tamamla.
4. Katalog, fiyat listesi, indirim, sepet ve ödeme snapshot tüketicilerini bağla.
5. İzole test ve migration uyumluluğunu doğrula.

### Mira — kullanıcı arayüzü
Atlas’ın sabit sözleşmesi üzerinden:
1. Kur ve Altın Referansları ekranı.
2. Ürün/varyant fiyat yöntemi ve sade dinamik alanlar.
3. Hesap açıklaması ve eski/yeni fiyat önizlemesi.
4. İşlem geçmişi, conflict ve unavailable durumları.
5. 1440/1024/390 görünüm ve klavye/odak kontrolleri.

Mira ayrı bir frontend hesap motorunu fiyat otoritesi yapmayacak. Mevcut Celebix tasarım sistemi ve ortak shell kullanılacak.

### Birleşik kabul
Bütünleştirme sonrasında tek tutarlı adayda tam ilgili test/typecheck/build, fiyat/quote regresyonu ve bağımsız review. Tek tek branch testleri birleşik sonucun yerine geçmez.

Belge onayı uygulama/yayın fiili yapılmış anlamına gelmez. Kodlama görevinde mevcut canonical’dan doğrulanan başlama SHA’sı ve source/PR’lar kaydedilecek. Yayın için ayrıca exact aday, migration, geri dönüş ve pilot kapsam onayı gerekir.

## 15. İlk sürüm dışında tutulanlar

- Harem/TCMB/başka sağlayıcıdan otomatik fiyat çekme ve ücretli API aboneliği.
- Gerçek USD/EUR tahsilatı, çok para birimli iade ve ödeme hesabı.
- Gümüş/platin/kripto veya serbest kullanıcı formülü.
- Kuyumcu alış/bozdurma fiyatı, eski altın takası ve stok değerleme sistemi.
- İşçilik bedelinin gram altın/döviz cinsinden ayrı karma bileşen olması.
- Mevcut indirim motorunda yoksa yalnız işçilikten indirim.
- Tartım sonrası tutarı değişen sipariş veya ek otomatik tahsilat.
- Genel vergi/fatura motorunun yeniden yazılması.
- Zamanlanmış toplu ticari kur değişimi ve fiyat optimizasyonu.

Veri modeli bunları engellemeyecek; fakat ilk dört temel yöntemin teslimini geciktirecek görünür yarım seçenekler eklenmeyecek.

## 16. Değişiklik ve yayın sınırları

Bu çalışma müşteri fiyatını etkiler; yalnız Panel deploy edilerek tamamlanmış sayılmaz. Değişen gerçek tüketicilere göre storefront/checkout yayın ihtiyacı belirlenir.

Mevcut ürünler sabit fiyat modelinde kalır. Güzide’ye ve diğer tenant’lara manuel referans/fiyat politikası kendiliğinden atanmaz. Üretimde sahte kur veya varsayılan altın fiyatı seed edilmez.

Pilot aktivasyondan önce doğru storefront/admin ortamı, domain ve tenant doğrulanır. Staging’e yapılan iş production teslimi olarak sunulmaz.

Geri dönüş:
- Yeni politika yazımlarını kontrollü durdur.
- Referans güncellemesini geri almak için eski değerden yeni audit’li sürüm üret.
- Sipariş/ödeme geçmişini ve snapshot’ları koru.
- Referans modelleri artık kullanılmaya başlanmışsa eski, onları anlamayan sürüme körlemesine dönme.
- Metadata/migration silerek eski tahsilat bağını kaybetme.

Test verisi temizliği, Tasarım Ayarları PR #79, domain ayarları, arşivleme ve diğer agent çalışmalarına dokunulmaz.

## 17. Teslim tanımı

“Fiyatlandırma tamamlandı” demek için:
- Merchant manuel referans girip etkiyi görerek uygulayabiliyor.
- Dört fiyat temeli doğru ve varyant bazlı çalışıyor.
- Gram tanımı, işçilik ve ayar dönüşümü belirsiz değil.
- Liste/sepet/quote aynı canonical hesapla çalışıyor.
- Mevcut fiyat listesi/indirim/sabit ürünler bozulmuyor.
- Kur değişimi yeni satışları etkiliyor, eski siparişleri etkilemiyor.
- Yetki, concurrency, rounding ve başarısızlık senaryoları test ediliyor.
- Canlı kabulde nelerin gerçekten yapıldığı açık.
- Gerçek provider işlemi ve vergi/fatura uygunluğu ayrı kanıt kapıları olarak raporlanıyor.

## Kaynaklar ve kanıt türü

Repository incelemesi (salt-okunur, yukarıdaki exact SHA):
- packages/saas-data/src/catalog/types.ts
- packages/saas-contracts/src/pricing/types.ts
- packages/saas-data/src/pricing/types.ts
- packages/saas-data/src/pricing/repository.ts
- packages/saas-data/src/storefront-commerce/types.ts

Dış referanslar:
- ikas, Fiyat Listesi: https://support.ikas.com/tr/fiyat-listesi
  Manuel kur, fiyat listesi ve dinamik kural yaklaşımı karşılaştırması. Celebix’in bunu hazır desteklediğini kanıtlamaz.
- PostgreSQL 16, Numeric Types: https://www.postgresql.org/docs/16/datatype-numeric.html
  Exact numeric ve inexact floating-point ayrımı. Seçilecek alan ölçekleri bu belgenin ürün/teknik önerisidir.
