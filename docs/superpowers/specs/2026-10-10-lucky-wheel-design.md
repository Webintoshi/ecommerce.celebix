# Celebix Şans Çarkı — tasarım

Tarih: 10 Ekim 2026

Durum: Yazılı tasarım incelemesi; ürün kodu ve canlı yayın henüz yapılmadı.

## 1. Amaç ve kullanıcı kararları

Mağaza sahibi, İndirimler → Şans Çarkı ekranından gerçek indirimlere bağlı bir çark hazırlayabilecek. Ziyaretçi **önce e-posta veya telefonunu girecek, ardından çarkı çevirecek ve kazandığı kuponu alacak**. Üyelik gerekmeyecek. Özellik mevcut ve yeni mağazalarda ortak altyapıyla sunulacak; her mağazanın kampanyası ve kayıtları ayrı olacak.

Kullanıcının kesinleştirdiği kararlar:

- Yönetim adresi `/discounts/lucky-wheel`; yeni ve düzenleme ekranları bu bölüm altında.
- Tek çark tasarımı; mağaza renkleri değiştirilebilir.
- Dilimler gerçek kupon koşullarına bağlı; sonuç inandırıcı ve gerçek olacak.
- İletişim bilgisi çark çevrilmeden önce alınacak.

Bu tasarımın varsayılanları: 6 dilim, e-posta veya telefon seçeneklerinden biri, tarayıcı başına 7 günde bir katılım, kazanımdan itibaren 24 saat kupon süresi. Mağaza bunları belirtilen sınırlar içinde değiştirebilir. Bunlar kullanıcının ayrıca belirlediği değerler değildir.

## 2. Yaklaşım

| Seçenek | Değerlendirme |
|---|---|
| Ortak Celebix çarkı + mevcut indirim motoru | Önerilen. Yönetim, kupon, sepet, ödeme ve geçmiş aynı sistemde kalır. Yeni katılım ve kupon üretim desteği gerekir. |
| Klaviyo veya başka servis çarkı | Dış servis hesabı, form kurulumu ve kupon uyumu gerekir. Tüm mağazalara aynı yerel deneyimi sağlamaz. |
| Çarka özel ikinci indirim motoru | Fiyatlama ve kupon kurallarını tekrarlar; kullanılmayacak. |

Mevcut sayfa, ödülleri serbest metin olarak kaydedip bir önizleme gösteriyor. Çalışan bir ziyaretçi katılımı, sunucuda ödül seçimi veya gerçek kupon üretimi içermiyor. Bu nedenle çalışma, mevcut formu güzelleştirmeye ek olarak yeni bir ortak katılım akışı gerektiriyor.

İlgili mevcut parçalar:

- `apps/customer-panel/app/discounts/lucky-wheel/page.tsx`: mevcut bölüm.
- `apps/customer-panel/components/merchant-admin/MerchantRecordEditor.tsx`: genel form ve statik önizleme.
- `packages/saas-contracts/src/promotions/types.ts`: indirim koşulları ve finansal tutarlar.
- `packages/saas-contracts/src/store-engagement/index.ts`: yalnız popup ve sepet yakalama içeren mevcut V1 sözleşmesi.
- `apps/storefront-shared/components/StoreEngagement.tsx`: iletişim toplama, kupon ve açılır pencere koordinasyonu.
- `apps/owner/scripts/sql/saas/202609050126_promotions_studio.up.sql`: değerlendirme, kod ayırma ve kullanım akışı.

## 3. Yönetim ekranı

Liste; arama, aktif/kapalı/arşiv filtresi, kampanya oluşturma, düzenleme, işlem geçmişi ve silme sunar. Liste ve detaylarda dağıtılan kupon, kullanılan kupon ve gerçekleşen indirim tutarı ayrı gösterilir. Satış rakamı, tamamlanmış ve gerçekten kupon uygulanmış siparişlerden hesaplanır; iptal/iade durumu açıklanır. Çarkın ek satış yarattığı iddia edilmez.

Yeni/düzenleme ekranının bölümleri:

1. **Kampanya:** ad, açık/kapalı, isteğe bağlı başlangıç/bitiş, başlık, kısa açıklama.
2. **Görünüm:** çarkın iki dilim rengi, arka plan, vurgu rengi; canlı önizleme. Yazı rengi okunabilirliğe göre belirlenir. Görünüm sabittir; serbest HTML, JavaScript veya font yükleme yoktur.
3. **Ödüller:** 4–8 dilim. Her dilim bağlı indirim, kazanma oranı ve isteğe bağlı toplam dağıtım sınırı taşır. Kısa ödül adı gerçek indirimden otomatik oluşturulur; örneğin %5 kupona “%20 indirim” yazılamaz. Mevcut uygun indirim seçilebilir; pencere içinden yeni uygun indirim oluşturulabilir.
4. **Katılım:** e-posta / telefon / herhangi biri, yeniden katılım aralığı (1–90 gün), kupon süresi (1–720 saat), ayrı pazarlama izni metni.
5. **Gösterim:** masaüstü/mobil, izin verilen sayfalar, isteğe bağlı kaydırma sonrası açılma. Varsayılan küçük bir çark düğmesidir; sayfa açıldığı anda tam ekran kaplamaz.

İlk sürümde aynı mağazada tek açık çark bulunabilir. İkinci kampanya açılmak istendiğinde mevcut kampanya gösterilir; sessizce kapatılmaz. Kapalı kampanyalar kaydedilebilir. **Kaydet**, seçilen açık/kapalı durumu ve geçerli ayarları doğrudan uygular; ek taslak/yayınlama adımı yoktur. Hata halinde form korunur. Önizleme çevirmesi iletişim, kupon, katılım veya finans kaydı üretmez.

Kaydetmeden önce oranların toplamı %100, her görünür ödülün oranı sıfırdan büyük ve tüm indirim bağlantıları geçerli olmalıdır. Dağıtım sınırı girilmiş bir dilim tükenirse yeni katılım kapanır; kalan ödüllere olasılık sessizce dağıtılmaz. Admin hangi ödülün tükendiğini görür ve açıkça yeni sürüm kaydeder. Aynı dilimin dağıtım sayacı sürüm değişince sıfırlanmaz; sınır artırılacaksa yeni toplam açıkça girilir.

## 4. Ziyaretçi görünümü ve akış

Tek tasarım; belirgin sabit işaretçi, iki renkli dilimler, okunabilir kısa ödül adları ve sade merkez düğmesi kullanır. Masaüstünde çark ve form yan yana, mobilde tek sütun olur. Uzun kupon şartları çark içine döndürülmüş paragraflar olarak yazılmaz. Referansların markaları veya görsel dosyaları kopyalanmaz.

1. Ziyaretçi çark düğmesini açar; şartları ve ödülleri görebilir.
2. Seçilen iletişim yöntemine göre e-posta veya telefon girer. Pazarlama izni ayrı ve başlangıçta işaretsizdir; işaretlememek çevirme hakkını engellemez.
3. **Çevir** isteği sunucuda iletişim kaydını, seçilmiş ödülü, tekil kuponu ve varsa dağıtım sayacını birlikte kalıcılaştırır.
4. Animasyon, sunucunun kaydettiği dilimde durur. Tarayıcı sonucu seçmez.
5. Kazanılan ödül, kupon kodu, son kullanım zamanı ve gerçek koşullar gösterilir. **Kodu kopyala** ve **Alışverişe devam et** bulunur. Sepet varsa **Sepete uygula** normal sepet kontrolünü çalıştırır; boş sepette kod saklanır ve ürün eklenince kontrol edilir.

Sonuç ekranını kapatma veya sayfayı yenileme, yeni ödül üretmez. Aynı tarayıcı mevcut katılımını güvenli ziyaretçi kimliğiyle yeniden açabilir. Sonuç iletişim adresiyle herkese açık sorgulanamaz. Telefon seçimi otomatik SMS, e-posta seçimi otomatik e-posta gönderimi başlatmaz; ilk sürümde kupon ekranda sunulur.

Dilimler görsel olarak eşit büyüklükte olabilir; kazanma oranlarının farklı olabileceği açıkça belirtilir. **Ödüller ve kazanma oranları** bölümünde gerçek oranlar ve koşullar okunabilir şekilde gösterilir. Sıfır şanslı gösteriş ödülü, sahte geri sayım veya tekrar başlayan süre kullanılmaz. İlk sürümün tüm dilimleri gerçek indirim ödülüdür.

Ödeme, hesap ve ödeme sonucu sayfalarında çark açılmaz. Sepet yakalama, popup ve çark aynı açılır pencere koordinasyonuna katılır; eşzamanlı iki pencere veya yan sepetin üstünde zorunlu çark olmaz. Çevirme başladıktan sonra başka kampanya sonucu örtemez.

## 5. Gerçek kupon ve fiyatlama

İlk sürüm yüzde indirimi, sabit tutar indirimi ve ücretsiz kargoyu kapsar. Para mevcut sistemdeki gibi kuruş, oran baz puan olarak tutulur. İndirim motorunun desteklediği sepet alt sınırı, ürün/kategori kapsamı, üst tutar sınırı, yöntem koşulları ve birleşme kuralları korunur. Kaynak indirim herkese açık olmalı; müşteri kimliği gerektiren segment, kişi başı kullanım veya önceki sipariş koşulları ilk anonim çark ödülü olarak seçilemez. Yönetilen ödül yalnız WEB kanalında ve `perCustomerUsage=null` ile çalışır; bir kullanım sınırı kod üzerinden uygulanır. Kaynak indirimin ortak kullanım/bütçe havuzu çarka taşınmaz: ilk sürüm toplam kullanım veya bütçe sınırı bulunan kaynakları seçime açmaz. Dağıtım sınırı çarkta açıkça belirlenir; normal kaynak kuponların kullanımı verilmiş çark kodlarını tüketmez.

Her kazanım için rastgele, mağazada benzersiz ve **toplam bir kez kullanılabilir** kod üretilir. Kod, doğrulanmış kişiye özel bir erişim belgesi değildir; kodu bilen kişi normal sepetinde kullanabilir. Başka cihazda kodla alışveriş mümkündür. Kod paylaşılırsa ilk geçerli kullanım hakkı tüketir. Doğrulanmamış e-posta/telefonu kimlik kabul edip başka kişinin hakkını açmak veya tüketmek yoktur.

Mevcut toplu kuponlar aktif müşteri gerektiriyor. Bu kural genel olarak kaldırılmaz. Yalnız sunucuda doğrulanmış **çark kaynaklı tek kullanımlık kodlara** özel, müşteri kimliği gerektirmeyen değerlendirme yolu eklenir. Kodun türü, mağazası, ödül sürümü, süresi ve kullanım hakkı sunucudan okunur. Tarayıcı `source=wheel` veya sahte bir hak göndererek bu yolu açamaz. Normal sepet sahipliği kontrolleri aynen uygulanır.

Kaynak indirimin değiştirilebilir kimliği tek başına yeterli değildir. Kaydederken her ödülün koşulları **değiştirilemeyen ödül sürümüne** sabitlenir. Ödül sürümü başına ortak, sistem tarafından yönetilen bir indirim kaydı kullanılabilir; her kazanana yeni bir indirim tanımı açılmaz. Gelecekteki ayar değişikliği yeni sürüm oluşturur. Önceden verilmiş kupon, kazanıldığı sürümün koşulları ve kazanımdan hesaplanan kendi süresiyle değerlendirilir. Sabitlenen kaynak koşullarının bitişi daha erkense kupon o tarihte biter; kazanımdan önce ödül koşullarında ve kazanımdan sonra sonuçta bu son tarih gösterilir. Kaynak başlangıcı gelmeden veya bitişi geçtikten sonra o ödül dağıtılamaz; görünür dilimler değiştirilmeden kampanya katılımı kapalı kalır. Kampanyanın gösterim bitişi, verilmiş kuponun süresini ayrıca kısaltmaz.

İndirimler ekranında kaynak **Şans Çarkı**, kampanya bağlantısı ve dağıtılan/kullanılan kodlar görünür. Yönetilen ödül koşulları doğrudan değiştirilemez; düzenleme çark üzerinden yeni sürüm oluşturur. Kod ayırma, ödeme sonrası kullanımı kesinleştirme, başarısız siparişte serbest bırakma ve iade kuralları mevcut kupon işlem sınırlarına bağlanır. Üretim, değerlendirme, ayırma ve kesinleştirme aynı koşul sürümünü kullanır; ikinci bir fiyat motoru kurulmaz.

## 6. Kayıtlar, sözleşmeler ve güvenilirlik

| Kayıt | İçerik ve amacı |
|---|---|
| Kampanya ve sürüm | Mağaza, kimlik, sürüm, durum, takvim, görünüm, iletişim ve gösterim kuralları. |
| Ödül sürümü | Sabit dilim kimliği, oran, indirim koşulları, kaynak bağlantısı, dağıtım üst sınırı. |
| Katılım/ödül | Mağaza, kampanya, sunucudaki ziyaretçi kimliği, işlem kimliği, sabitlenen sürüm, sonuç ve kazanım zamanı. |
| Verilmiş kupon | Katılım, rastgele kod, ödül sürümü, son kullanım, ayrılmış/kullanılmış/iptal durumu. |
| İletişim/onay | İletişim kanalı, kampanya kaynağı; yalnız seçilmişse onay metni/sürümü/zamanı. Giriş hesabı oluşturmaz. |
| İşlem geçmişi | Gerçek çalışan, değişiklik, sürüm ve zaman; iletişim ve gizli ziyaretçi anahtarları loglara yazılmaz. |

Yeni tipler `packages/saas-contracts/src/lucky-wheel` altında, veri işlemleri `packages/saas-data` içinde sınırlandırılır. Admin yönetimi `/api/discounts/lucky-wheel` altında; vitrin okumaları ve katılım `/api/lucky-wheel/settings`, `/api/lucky-wheel/spin`, `/api/lucky-wheel/result` altında ayrı V1 sözleşmesi kullanır. Mevcut popup/sepet yakalama V1 yanıtına yeni zorunlu alan eklenmez.

Mağaza güvenilir alan adı bağlamından, yönetim çalışanı mevcut üyelikten belirlenir. İstemciden mağaza/müşteri kimliği kabul edilmez. Mutasyonlar `Idempotency-Key` ve beklenen kampanya sürümünü taşır. Aynı işlem/fingerprint aynı sonucu döndürür; farklı içerikle aynı anahtar reddedilir. Kaydetme ile sunucunun seçimi yarışırsa `version_conflict` döner; yeni koşullarda sessizce çevirme yapılmaz.

İletişim + katılım + ödül + kupon + kota aynı veritabanı işleminde tamamlanır. Ziyaretçi katılım penceresi kilitlenir; eşzamanlı iki farklı işlem de ikinci ödül üretemez. İşlem timeout olduğunda istemci aynı işlem kimliğini saklar ve sonucunu sorgular; sonucu bilinmeden yeni işlem üretmez. Animasyon yarıda kesilse de kayıt korunur.

Sunucu rastgele seçimi güvenli rastgele kaynaktan yapar. Oranlar tamsayı olarak toplam 10.000 baz puandır; kayan nokta veya tarayıcı rastgeleliği ödül seçmez. Kota ve kupon çakışmaları aynı işlem içinde çözülür.

Sunucuda saklanan, mağazaya bağlı güvenli ziyaretçi kimliği; hız sınırı ve kampanya kotası birlikte kullanılır. Tarayıcı temizlenirse veya başka tarayıcı kullanılırsa aynı gerçek kişiyi kesin tanıyamayız. Arayüz **“bu tarayıcıdan 7 günde bir”** gibi gerçek sınırı bildirir; doğrulanmamış iletişimle “her kişi yalnız bir kez” garantisi vermez. İletişim değerini başka kişinin sonucuna erişim anahtarı yapmak yasaktır.

## 7. Kapama, değişiklik ve silme

| İşlem | Sonuç |
|---|---|
| Kampanya kapatılır/tarihi biter | Yeni gösterim ve katılım durur; verilmiş kuponlar kendi sürelerinde geçerli kalır. |
| Kampanya düzenlenir | Yeni katılımlar yeni sürümü kullanır; eski sonuç ve koşullar değişmez, katılım penceresi sıfırlanmaz. |
| Kaynak indirim geçersiz hale gelir | Gelecek dağıtım için admin doğrulaması gerekir. Önceden verilmiş sabit koşullar etkilenmez. |
| Çark silinir | Yönetim listesinden ve vitrinden kalkar. Yeni katılım durur; geçmiş sonuç ve verilmiş kupon kayıtları korunur. Silme açıklaması bunu açıkça söyler. |
| Verilmiş kuponlar iptal edilir | Ayrı ve etkisi gösterilen yetkili işlem gerekir; eski sipariş/iade kanıtı korunur. |
| İletişim kaldırılır | Gereksiz kişisel veri kaldırılır/anonimleştirilir; gerekli işlem bağlantıları korunur. Otomatik yeni çevirme hakkı doğmaz. |

Kupon geçerliliği kampanyanın güncel durumuna bağlanmaz. Kaynağı silme veya genel indirim silme işlemi, çarktan verilmiş kodları sessizce iptal edemez. İptal kontrolü kupon ayırma ve sipariş kesinleştirmesiyle mevcut güvenli işlem sınırında çalışır; başlamış ödeme/iade kayıtları bozulmaz.

## 8. Pazarlama ve performans

İletişim toplama, kampanya mesajı izni değildir. Ayrı onay seçilmişse mevcut onay kanıtı modeline çark kaynağı eklenir. Onaysız iletişim kaydı Brevo/Klaviyo pazarlama aktarımına girmez. Mevcut **kullanıcı başlattığında eşitleme** davranışı korunur; otomatik eşitleme döngüsü veya otomatik SMS/e-posta servisi eklenmez.

Aktif kampanya yoksa çark çizimi ve animasyon kodu yüklenmez. Aktif kampanyada küçük bir genel ayar okuması ve isteğe bağlı tembel yüklenen arayüz kullanılır. Sürekli sorgu, her mağazaya ayrı süreç veya her ziyaretçiye arka plan işi kurulmaz. Önbellek anahtarları mağaza/alan adı/sürüm içerir; kayıt/silme sonrası ilgili önbellek yenilenir. Raporlar sınırlı ve sayfalı okunur. Gerçek yük etkisi ölçülür; sıfır yük iddia edilmez.

## 9. Kabul ve yayın

- E-posta/telefon önce, boş sepet ve üyelik olmadan kazanım, geçerli kuponla anonim alışveriş.
- 4/6/8 dilimde işaretçiyle sunucu sonucunun eşleşmesi; %100 toplam, sıfır/negatif oran ve geçersiz indirim engelleri.
- Çift tıklama, eşzamanlı farklı işlem anahtarı, son kota, timeout ve yenileme sonrası tek sonuç/tek kod.
- Bir kodun iki sepetçe aynı anda kullanılması; yalnız biri kesinleşir. Başarısız ödeme, iptal ve iade mevcut kuralları korur.
- Kaynak/ödül sürümü değişikliği, kampanya kapama/silme ve kupon iptali; verilmiş şartların korunması.
- Ödül adının gerçek kuponla eşleşmesi, kaynak bitişinin daha erken olması, sürüm değişikliğinde katılım/kota sayacının sıfırlanmaması.
- Mağazalar arası veri/kod/ziyaretçi ayrımı, hatalı alan adı, sahte kaynak, fazla gövde, yetkisiz yönetim ve hız sınırları.
- Onay seçili/seçili değil; manuel pazarlama eşitlemesi; pazarlama izninden bağımsız ödül.
- Popup ve sepet yakalama ile tek pencere; checkout/hesap istisnaları; mevcut genel kupon/toplu kod akışları.
- 1440/1024/390 piksel, klavye ve odak, azaltılmış hareket, ekran okuyucu sonucu, form hata sonrası korunması.
- İzole mağazada gerçek uçtan uca kabul; örnek kampanya/kupon/iletişim üretim mağazalarında oluşturulmaz.

Önce uyumlu veri ve kupon okuyucuları, ardından ortak admin ve vitrin yayını yapılır. Güncel release sahibiyle ortak pin/kuyruklar koordine edilir; admin NET → SITE sırası korunur. Destek gereken tüm vitrin okuyucuları doğrulanmadan özellik açılmaz. Canlı kabul, çalışmakta olan kaynak ve mağaza ayrımıyla doğrulanır; yalnız başarılı build canlı tamamlanma sayılmaz. Kapama/geri alma yeni katılımı durdurur, dağıtılmış kodların okunması ve mevcut siparişlerin tamamlanması korunur.

## 10. İlk sürüm sınırları

Tek tasarım, 4–8 indirim dilimi, mağaza başına tek açık kampanya, gerçek tek kullanımlık kupon, iletişim ve ayrı isteğe bağlı pazarlama onayı kapsam içindedir. Fiziksel ödül/nakit, OTP, kesin kişi başı katılım garantisi, otomatik kupon mesajı, A/B test servisi ve bağımsız kampanya gönderim sistemi bu sürümde yoktur.

Araştırma: `docs/research/sans-carki-2026-10-10.md` ana çalışma alanında bulunur. Araştırmadaki birden fazla şablon önerisinin yerini kullanıcının **tek tasarım** kararı almıştır.
