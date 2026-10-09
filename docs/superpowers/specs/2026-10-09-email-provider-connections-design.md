# E-posta servis bağlantıları

Tarih: 9 Ekim 2026

Durum: Kullanıcı 9 Ekim 2026'da Brevo ve Klaviyo çalışmasını onayladı; resmi logoların kullanılması kapsamına eklendi. Kullanıcı uygulama planını ve aynı sohbet içinde kodlamayı onayladı. Ortak sözleşmeler, aday veri desteği, arka plan eşitlemesi, HTTP ve logolu ekran uygulandı. İzole kabul/yayın hazırlığı sürüyor; gerçek sağlayıcı hesabı kabulü ve üretim aktivasyonu bekliyor. Canlı veri güncellemesi, gerçek hesap bağlantısı veya gönderim yapılmadı.

## 1. Amaç ve karar

Mağaza sahibi Pazarlama → E-posta bölümünde kendi e-posta pazarlama hesabını bağlar. Celebix, açık pazarlama izni olan kişileri seçilen servise eşitler. Kampanya hazırlama, zamanlama, gönderim ve kampanya raporları servisin kendi ekranında yönetilir.

Amaç; kullanılabilir ücretsiz seçenek sunmak, mağaza sahibinin bağlantı ve kişi aktarımını kolaylaştırmak, admin ekranına ağır bir kampanya editörü eklememek ve gönderim ürününün bakımını üstlenmemektir. Dışarıda kampanya hazırlama ikinci bir uygulama kullanmayı gerektirir; bu model bütün kampanya işlemlerini Celebix içinde yapma beklentisini karşılamaz.

İlk uygulanacak bağlantılar **Brevo ve Klaviyo** olacaktır. **MailerLite ve Sender**, ücretsiz hesapla teknik kabulü tamamlandıktan sonra aynı bağlantı yapısına eklenecek adaylardır. Omnisend ve Mailchimp incelendi; ilk sürümde desteklenen bağlantı olarak gösterilmeyeceklerdir.

Bu tercih bakım yükü ve doğrulanmış API sözleşmelerine dayanır. Daha yüksek dönüşüm, daha iyi teslimat veya sıfır performans etkisi ölçülmüş değildir.

## 2. Servis seçimi

9 Ekim 2026 tarihli resmi kaynakların karşılaştırması:

| Servis | Ücretsiz paket | Bu çalışma için durum |
|---|---|---|
| Brevo | 100.000 kişi saklama, günde 300 e-posta | İlk sürüm: kişi/liste API'leri ve hesap kimliği doğrulanmış. 300 kişiden büyük kampanyalarda ücretsiz paketin günlük yeniden kuyruğa alma adımı var. |
| Klaviyo | 250 aktif profil, ayda 500 e-posta | İlk sürüm: mevcut e-ticaret odağı ve hesap/izin API'leri uygun. Küçük ücretsiz paket ve bazı webhook erişim kısıtları var. |
| MailerLite | 250 aktif abone, ayda 2.500 e-posta | Sonraki aday: sade bülten deneyimi. Ücretsiz API gönderim yapmıyor; dışarıda kampanya hazırlama modelinde bu tek başına engel değil. Yeni API'deki hesap bağlama kimliği ve ücretsiz webhook sınırları gerçek hesapla doğrulanmalı. |
| Sender | 2.500 abone, ayda 15.000 e-posta | Sonraki aday: ücretsiz kapasitesi güçlü. Ücretsiz kişi API'si var; pazarlama webhook'u yok, durum okuma ile eşitleme yapılabilir. REST hesap kimliği ve token yetki kapsamı kabul denemesi gerekiyor. |
| Omnisend | 250 kişiye erişim, ayda 500 e-posta | E-ticaret alternatifi. Tam değeri için katalog, sepet ve sipariş olaylarının ayrıca bağlanması gerekiyor. |
| Mailchimp | 250 kişi, ayda 500 e-posta, günde 250 | Bilinen marka; yeni küçük mağaza için ücretsiz kapasite ve otomasyon açısından öncelikli tercih değil. |

Bir kişinin serviste kayıtlı olması, pazarlama izni verdiği anlamına gelmez. Saklama limiti, aktif kişi limiti ve gönderim limiti birbirinin yerine kullanılmayacaktır. Katalogdaki ücretsiz paket bilgisi tarih ve resmi fiyat bağlantısıyla gösterilir; mağazanın gerçek paketi veya kullanılabilir kotası olarak sunulmaz. Gerçek hesapta doğrulanamayan kota “bilinmiyor” olur, sıfır sayılmaz.

Resmi fiyat kaynakları:

- https://help.brevo.com/hc/en-us/articles/208589409-About-Brevo-s-pricing-plans
- https://help.brevo.com/hc/en-us/articles/208580669-FAQs-What-are-the-limits-of-the-Free-plan
- https://www.klaviyo.com/pricing
- https://www.mailerlite.com/pricing
- https://www.sender.net/pricing/free-plan/
- https://support.omnisend.com/en/articles/3533018-omnisend-pricing-plans-2026
- https://mailchimp.com/help/about-mailchimp-pricing-plans/

## 3. Kullanıcı deneyimi

### E-posta ekranı

Mevcut Pazarlama → E-posta adresi korunur. İlk sürümde Brevo ve Klaviyo kartları görünür. Kartta servis adı, ücretsiz paket özeti, bağlı hesap/liste, bağlantı durumu ve son eşitleme bulunur. Aynı başlık ekran içinde tekrar edilmez; mevcut Celebix renkleri, düğmeleri ve ortadaki pencere yapısı kullanılır.

Kartlarda resmi Brevo ve Klaviyo logoları küçük, orantılı ve markanın özgün görünümüyle kullanılır. Güvenliği ve kullanım kapsamı doğrulanan SVG'ler uygulamanın statik varlıklarından sunulur; üçüncü taraf logo kütüphanesi veya çalışma anında dış görsel isteği eklenmez. Resmi kaynak ve kullanım koşulları kayda alınır; bir ortaklık/onay rozeti üretilmez.

Temel akış:

1. **Hesap oluştur** servisin resmi kayıt ekranını açar; mağaza kendi hesabını oluşturur.
2. **Bağla** penceresinde mağazanın API anahtarı bir kez girilir. Anahtar doğrulanınca hesabın güvenli özeti ve erişilebilen listeler gelir.
3. Mağaza bir liste seçer veya Celebix için yeni bir liste oluşturur. “Aktarılacak izinli kişi”, hariç tutulan kişi ve bilinen paket sınırı gösterilir. Sağlayıcı engeli sayısı yalnız son tamamlanmış kontrolden bilinen sonuçtur; kontrol zamanı ve henüz kontrol edilmemiş kişi sayısı ayrıca görünür. Önizleme bütün kişileri sağlayıcıdan okuyup ekranı bekletmez; bilinmeyen engel sıfır gösterilmez.
4. **Uygula**, gerçek bağlantıyı kaydeder ve seçilmiş aktarımı arka planda başlatır. Ayrı taslak/yayımla/etkinleştir adımı yoktur.
5. **Kampanyaları aç**, servisin sabit ve doğrulanmış yönetim adresini yeni sekmede açar. Kullanıcı serviste oturum açması gerektiğini anlayabilir; API anahtarı bir tarayıcı oturumu sağlamaz.

İlk sürüm her mağazada bir etkin dışa aktarım bağlantısı kullanır. Başka servisi seçmek için eski bağlantının yeni aktarımı durdurulur; gönderilmiş işler uzlaştırılır ve Celebix listesindeki eşlenmiş kişiler çıkarılır. Temizleme tamamlanmadan yeni bağlantı aktarımı başlamaz. Eski servis hesabındaki diğer listeler, kampanya ve otomasyonlar ayrıca o serviste yönetilir. Celebix bağlantısını kaldırmak dışarıda hazırlanmış veya zamanlanmış kampanyaların iptal edildiği anlamına gelmez; kaldırma penceresi bunu açıkça belirtir. Temizleme yapılamazsa bağlantı kaldırıldı diye gösterilmez; gerekli servis işlemi açıklanır.

Bağlantı bilgileri ve kişi sayısı kalıcı kayıt üzerinde tutulur. Sayfayı açmak yeni liste, kişi aktarımı veya sağlayıcı değişikliği oluşturmaz. Hata sırasında liste/seçimler korunur. Anahtar tarayıcı depolarına yazılmaz; başarısız bir anahtar doğrulamasında yalnız açık pencerenin belleğinde kalır ve kapanınca temizlenir.

### Kurulum gerçeği

API anahtarı, bağlantı ve kişi eşitleme için yeterli olabilir; dış servisin hesap incelemesini, şart kabulünü ve gönderici alan adı DNS doğrulamasını otomatik olarak tamamlamaz. Celebix yalnız doğrulanmış gönderici durumunu gösterir; kalan adımı servisin kendi ekranında tamamlatır. Başka bir DNS sağlayıcısındaki mağaza alan adına yazma yetkisi varmış gibi davranılmaz.

Kayıtlı kişileri bir listeye eklemek serviste önceden kurulmuş otomasyonları tetikleyebilir. Uygula öncesinde bu etki ve aktarılacak kişi sayısı görünür. Klaviyo geçmiş aktarımında gerçekten yeni oluşturulan profiller için gerçek izin tarihleriyle `historical_import` değerlendirilir; bu seçenek çift doğrulamayı ve belgelenmiş “Added to list” akışını atlar, bütün otomasyonları veya abonelik engellerini koruduğu anlamına gelmez. Mevcut sağlayıcı profilleri yeniden abone edilmez; izin durumunu değiştirmeyen alan/liste güncellemeleri kullanılır. Brevo başlangıç aktarımı yeni, mağazaya ayrılmış listeye yapılır. Her iki serviste mevcut otomasyonların davranışı pilotta doğrulanır. Aktarımdan otomatik mesaj oluşması kabul sırasında mağazanın onayladığı sınırın dışına çıkarsa aktarım durur.

### Bağlantı ile gönderime hazır olma ayrımı

“Bağlı” yalnız hesabın, anahtarın ve listenin doğrulandığını gösterir. Gönderici doğrulanmadıysa veya servis hesabı incelemesi bekliyorsa yanında gerekli kurulum adımı gösterilir. “Eşitleme bekliyor”, “Eşitleniyor”, “Güncel”, “Yeniden bağlantı gerekli”, “Kota/yetki nedeniyle durdu” ve “Son kontrol yapılamadı” ayrı durumlardır. Başarısız kontrol daha önceki başarılı veriyi güncelmiş gibi göstermez.

## 4. İlk sürümün veri kapsamı

İlk bağlantı; izinli e-posta, varsa ad/soyad, izin zamanı/kaynağı ve mağazaya ayrılmış liste/grup üyeliğini eşitler. Telefon, adres, müşteri notları, borçlar ve tüm geçmiş siparişler varsayılan olarak dış servise aktarılmaz.

Katalog, sipariş, ürün görüntüleme ve terk edilen sepet otomasyonları ilk sürümün dışında ayrı bir artış olarak ele alınır. Böylece yalnız bülten/kampanya isteyen mağaza bütün e-ticaret geçmişini ve ek ücret doğurabilecek profilleri otomatik göndermek zorunda kalmaz.

Kişi oluşturma müşteri giriş hesabı oluşturmaz. Servisteki bağlantısız kişileri otomatik Celebix müşterisi yapmaz. Mevcut e-posta kampanya kayıtları ve olay geçmişi silinmez; yeni bağlantı sayfasından önceki kayıtlara erişilebilir. Mevcut kayıtlar kendiliğinden dış serviste kampanyaya dönüşmez.

## 5. İzin ve abonelikten çıkma

Tek mağaza/e-posta için normalleştirilmiş pazarlama izin görünümü kullanılır. Kaynaklar; mağazanın gerçek bülten kaydı, e-posta pazarlama izinli müşteri kaydı ve isteğe bağlı pazarlama izni alınmış sepet iletişim kaydıdır.

- E-posta adresinin bulunması veya ürün stok bildirimi istemek genel pazarlama izni sayılmaz.
- Açık ret/abonelikten çıkma aktarımı engeller. Sonraki genel müşteri düzeltmesi eski reddi geri açmaz.
- Yeniden izin yalnız o e-posta adresine yönelik yeni ve kaynağı/tarihi kayıtlı açık izinle değerlendirilir.
- Müşteri kartında e-posta değiştirilince eski adresin izni yeni adrese taşınmaz. Önceki izin kaydının hedef adresi doğrulanamıyorsa aktarım için yeni izin gerekir; izin kanıtı uydurulmaz.
- Aynı adres bir mağazada bir kez aktarılır. Başka mağazanın izin/ret kaydı bu mağazaya uygulanmaz.
- E-posta değişimi, arşiv ve ret aktarım kuyruğunda tekrar kontrol edilir. Arşivlenen kişi için yeni abonelik oluşturulmaz.
- Dış servisteki ret, spam ve kalıcı teslimat engeli korunur. Olağan kişi güncellemesinde “aktif yap”/“blacklist=false”/“subscribe” çağrısı yapılmaz.

Yerel pazarlama reddi, daha önce eşlenmiş sağlayıcı kişisi için öncelikli abonelikten çıkma işi oluşturur. İş yalnız gelecekteki aktarımı engellemekle tamamlanmış sayılmaz; sağlayıcıdaki ret sonucu okunup doğrulanır. Açık, mağaza genelindeki e-posta pazarlama reddi, bu mağazaya ayrılmış sağlayıcı hesabında e-posta pazarlamasından çıkma olarak uygulanır; SMS veya operasyonel e-posta izinleri değiştirilmez. Bir listeye özel ret yalnız o listeyi etkiler. Arşiv ve e-posta değişimi ise eski adresin Celebix listesindeki üyeliğini kaldırır; başka listelerdeki izni değiştirmez ve evrensel ret kanıtı üretmez. Yeni adres kendi izin kanıtıyla ayrı değerlendirilir.

Klaviyo listeden çıkarma ve unsubscribe ayrı adaptör işlemleridir. Bilinmeyen adres unsubscribe çağrısıyla yeni profile dönüştürülmez; kayıtlı sağlayıcı profil eşlemesi kullanılır. Listeye özel unsubscribe öncesi güncel liste üyeliği doğrulanır; kişi listede yoksa endpoint'in global unsubscribe yan etkisini doğuracak çağrı yapılmaz. Gerçek mağaza geneli ret için listeden bağımsız e-posta unsubscribe kullanılır. Brevo da gerçek pazarlama reddini, yalnız liste üyeliği temizliğinden ayrı uygular; transactional/SMS alanlarına dokunulmaz.

Sağlayıcıya özgü aktarım uygunluğu ayrıca kontrol edilir. Brevo'nun güncel veri tabanı politikası uyarınca iki yıldan eski izinle ilk aktarım yapılmaz; bu kişiler “iznin yenilenmesi gerekli” olarak sayılır. Kaynağı veya tarihi doğrulanamayan izin için tarih uydurulmaz. Sağlayıcı politikası uygulama sırasında tekrar doğrulanır.

Klaviyo Subscribe API'si bazı engelleri kaldırabilir; `historical_import` bunu önlemez. Mevcut sağlayıcı profilleri ilk aktarımda veya bağlantı yenilenince otomatik Subscribe işine alınmaz. İzin durumu uygunsa alanları ve izin değiştirmeyen liste üyeliği güncellenir; engelli veya belirsiz durumda yazma bekletilir. Yeni izin, geçmiş aktarım ve profil düzeltmesi ayrı işlem türleridir. İlk sürüm mevcut sağlayıcı profilinin yeniden aboneliğini otomatik yapmaz; gerçek yeniden izin servisin kendi doğrulama akışında tamamlanır. Spam/bounce engelleri kaldırılmaz. Yeni oluşturulan kişi için abonelik işi izin kanıtına bağlanır; kişi başına 30 dakikada en fazla bir Subscribe işi gönderilir. Sonucu belirsiz iş tekrar abonelik çağrısıyla çözülmez.

Brevo `emailBlacklisted`, listeye özel abonelikten çıkma ve varsa consent-group durumunu dikkate alır. Liste üyeliği izin yerine kullanılmaz. Rutin üyelik/profil işlemleri Celebix'e bağlı liste ve eşlenmiş kişilerle sınırlıdır; mağazanın diğer listeleri silinmez veya yeniden yazılmaz. Yukarıdaki açık mağaza geneli ret, eşlenmiş kişinin tüm e-posta pazarlamasından çıkması gerektiği için hesap genelindeki pazarlama engeline uygulanır.

Ret/engeller sağlayıcıdan geri alınır. Uygun webhook varsa olay kabul edilir; sınırlı periyodik kontrol kaçırılan olayları tamamlar. Webhook yoksa veya plan izin vermiyorsa kalıcı cursor/watermark ile durumlar okunur. Klaviyo'nun belgelenmiş suppression timestamp/liste filtreleriyle delta kontrol yapılır; 10 dakikalık örtüşme ve olay tekilleştirmesi kullanılır. Watermark ancak bütün sayfalar tamamlanınca ilerler. Brevo'nun belgelenmiş olayları ve güncelleme okumaları, ayrıca eşlenmiş kişilerin cursor ile tam kontrolü kullanılır.

Başlangıçta delta kontrol 5 dakikada bir denenir; tam kontrol hedefi 24 saattir. Bu süreler SLA değildir. Mağazalar adil sırayla, rate budget içinde en çok 100 profillik sayfalar ve tick başına en çok 2 sağlayıcı isteğiyle işlenir; tamamlanmamış tur sonraki işte devam eder. Kuyruk yaşı, tamamlanan son ret kontrolü ve bekleyen kişi sayısı gösterilir. Büyük hesapta bütçe hedefi karşılamıyorsa gerçek gecikme görünür; bütün profilleri aynı anda çekerek panel veya veritabanı zorlanmaz. Sağlayıcıdan gelen olumlu abonelik olayı, kendi başına Celebix'te yeni pazarlama izni oluşturmaz.

## 6. Bağlantı, yetki ve güvenlik

Yeni işlev mevcut tenant oturumu, exact-host mağaza yetkisi, Origin kontrolü ve `integrations.read/manage` yetkileriyle çalışır. Destek oturumu sınırları ve işlem geçmişi mevcut politikaya göre uygulanır. Kullanıcı girdisindeki store/tenant ID veya serbest API URL yetki kaynağı değildir.

API anahtarları yalnız sunucuda AES-256-GCM ile kapatılır. Mağaza, bağlantı, sağlayıcı, kullanım amacı ve anahtar sürümü authenticated data içine bağlanır. Yanıtlara, loga, işlem tekrar kayıtlarına, URL'ye veya tarayıcı deposuna ham anahtar yazılmaz. Anahtar yeniden gösterilmez. Mevcut ödeme ve Google anahtarları yeni sağlayıcılara gönderilmez.

Klaviyo ilk sürümü anahtar bazlıdır; yalnız hesap, liste, profil ve abonelik kapsamları istenir. Kampanya gönderme, fatura, SMS ve katalog yetkileri istenmez. Klaviyo OAuth sonraki bir deneyim iyileştirmesi olabilir; ilk sürüm çalışması için uygulama mağazası yayımlama veya OAuth istemcisi oluşturma gerektirmez.

Brevo güncel OAuth'ı dış müşteri hesaplarına açık bir ortak bağlantı olarak sunmuyor. Bu nedenle mağaza kendi API anahtarını kullanır. Anahtarın sağlayıcıda geniş yetkili olduğu açıklanır; Celebix adaptörü sabit hesap/liste/kişi/webhook işlemleriyle sınırlıdır. API üzerinden kampanya, gönderim veya fatura değiştirme yöntemi bu bağlantıya eklenmez.

Hesap bağlama için sağlayıcıdan dönen gerçek kimlik kullanılır: Brevo `organization_id`, Klaviyo hesap kaynak kimliği. Bir sağlayıcı hesabı aynı anda farklı Celebix mağazalarının etkin bağlantısı olarak kullanılamaz. Anahtar yenilenince aynı hesap kimliği ve seçilmiş listeye erişim doğrulanır. E-posta adresi veya anahtar hash'i sağlayıcı hesap kimliğinin yerine geçmez. Farklı hesaba geçiş açık bağlantı değiştirme işlemidir.

Sağlayıcı URL'leri sabit allowlist'tedir. İstek süreleri, yanıt boyutları ve sayfa boyutları sınırlandırılır. Yönlendirmeye anahtar aktarılmaz. HTTP hatalarının ham gövdeleri müşteriye/loga taşınmaz.

Brevo webhook'u belgelenmiş yüksek entropili bearer/custom-secret başlığı ve TLS ile doğrulanır; HMAC imzası varmış gibi tanımlanmaz. Klaviyo sistem webhook erişimi Advanced KDP/partner/allowlist şartlarına bağlıdır; normal anahtarda varsayılmaz. Olaylar bağlantı kimliğiyle eşlenir, tekrarları engellenir, eski olaylar güncel izni sessizce ezmez. Sağlayıcı olayından olumlu izin veya yeni müşteri oluşturulmaz.

## 7. Ortak sözleşme ve kayıtlar

Yeni modül `email-marketing-connections` olarak dar bir sınırda tutulur. Mevcut `google-marketing` ve provider credential yaklaşımından yetki/şifreleme/işlem tekrar örnekleri alınır; ödeme sağlayıcı kayıtlarına kampanya görevi eklenmez.

Ortak sözleşmeler:

- `EmailMarketingProvider`: ilk sürümde `brevo | klaviyo`.
- `EmailMarketingConnection`: bağlantı/sürüm, sağlayıcı hesap kimliği, liste kimliği, güvenli hesap özeti, durum, kurulum durumu, son kontrol ve son eşitleme.
- `EmailMarketingAudiencePreview`: izinli, reddedilmiş, adresi/kanıtı eksik, izni yenilenmesi gereken, bilinen sağlayıcı engelli, henüz kontrol edilmemiş ve bilinen limit dışında kalan sayılar; sağlayıcı kontrol zamanı.
- `EmailMarketingSyncSummary`: sırada, eşitlenen, engellenen, hata ve son kontrol; kuyruklanma başarılı aktarım olarak gösterilmez.
- `EmailMarketingProviderCapabilities`: hesap kimliği, liste, kişi, ret okuma, webhook ve gönderici kontrolü için doğrulanmış yetenekler. Desteklenmeyen özellik sahte başarılı yanıt üretmez.

Ekleme tipi kalıcı kayıtlar; mağaza bağlantıları ve kapatılmış credentials, hedef-adresli pazarlama izin/ret olayları, kaynak eşleme kayıtları, kişi eşitleme işleri, gelen olay tekrarları ve işlem geçmişidir. Açılış ekranı yalnız bunları okur. Geçmiş veri güncelleme numarası uygulama öncesi güncel ortak sürümle koordine edilir; bu doküman eski bir numarayı ayırmaz.

`/api/marketing/email-connections` altında overview, bağlantı doğrulama, liste/önizleme, apply, anahtar yenileme, recheck ve disconnect kaynakları bulunur. Sağlayıcı webhook'u ayrı, dar bir olay kabul yolundadır. Her değişiklik beklenen sürüm ve `Idempotency-Key` kullanır. Double-click aynı sonucu döndürür; başka operatörün değişikliği sessizce ezilmez.

## 8. Performans ve işlem güvenilirliği

Admin yalnız kayıtlı durum ve kısa önizlemeyi okur. Servis API'leri normal panel açılışında, sipariş ve ödeme isteğinin kritik yolunda beklenmez. Liste/anahtar kontrolü yalnız kullanıcı bağlantı işlemi sırasında süre sınırlı yapılır.

Eşitleme owner tarafında tek ortak, sınırlandırılmış background worker üzerinden yürür. Her tenant için ayrı timer, ayrı uygulama veya bütün müşteri tablosunu sürekli tarayan iş açılmaz. Kaynak izin/kişi değişikliğiyle aynı transaction içinde outbox kaydı oluşur. İlk aktarım cursor ile sınırlı sayfalarda çalışır; daha sonra değişiklikler eşitlenir.

Başlangıç sınırları: worker toplam eşzamanlılık 2, ayrılmış DB pool üst sınırı 4, tek sağlayıcı çağrısı 5 saniye, iş talebi en çok 25 kayıt. Bunlar kapasite vaadi değil, düşük başlangıç sınırlarıdır. Sağlayıcıya özgü rate budget bu sınırlardan ayrıca uygulanır; concurrency kendi başına rate limiter sayılmaz.

Brevo General/Free tierindeki kişi ve diğer endpoint limitleri ayrı bütçelenir. Klaviyo private-key limitleri aynı hesaptaki diğer uygulamalarla paylaşılır. `Retry-After` ve limit başlıkları takip edilir; 429'da bekleme, jitter/backoff ve kalıcı hatada iş durdurma uygulanır. Kota aşıldığında hesap yükseltme veya ücretli paket seçme işlemi yapılmaz.

Kişi işleri store/connection/generation/email/consent-version bazında tekilleştirilir. Worker başta lease alır, güncel bağlantı ve izin durumunu kontrol eder. Ağ kopmasında sonucu belirsiz oluşturma yeni kişi/listeyi körlemesine oluşturmaz; önce sağlayıcıdan sonuç okunur. Sağlayıcı çağrısı sırasında DB transaction veya connection tutulmaz.

Anahtar sürümü ile bağlantı generation ayrı tutulur. Aynı hesapta anahtar yenileme, tamamlanmamış işi yeni anahtarla uzlaştırır; otomatik tam aktarım veya yeniden abonelik oluşturmaz. Servis/hesap/liste değişimi ve disconnect, yeni grant/import taleplerini kapatıp bağlantıyı `draining` durumuna alır. Generation kontrolü henüz gönderilmemiş işleri sınırlar; gönderilmiş HTTP isteğini veya sağlayıcıdaki asenkron işi iptal ettiği iddia edilmez.

Gönderilmiş ve sonucu belirsiz işler kalıcı kayıtta tutulur. `202 Accepted`, kişi eşitlendi veya unsubscribe tamamlandı sayılmaz. Belgelenmiş iş durumu varsa o kaynak, yoksa hedef profil/üyelik/abonelik durumu okunarak sonuç uzlaştırılır. Desteklenmeyen bir cancel/status endpoint'i uydurulmaz. Sağlayıcı sonucu öğrenilince güncel izin, ret ve bağlantı sürümü yeniden kontrol edilir; sonradan gelen ret veya üyelik temizliği için düzeltici iş çalışır. Retler önceliklidir, ancak bu sıra dış serviste zaten çalışan bir işi ters sıralayamaz. Sağlayıcıya gönderilmiş abonelik ile eşzamanlı dış ret için atomik CAS güvencesi yoktur; görünür gecikme, düzeltici işlem ve belirsiz sonuçta yeni aboneliği durdurma uygulanır.

Eski kapatılmış credential, yalnız gerekli uzlaştırma/ret/üyelik temizliği için erişilebilir kalır; dışa aktarım yetkisi kapalıdır. Temizleme ve gönderilmiş işler sonuçlanınca secret yok edilir ve bağlantı tamamen kapatılır. Key önceden dışarıda iptal edilmişse sonuç belirsiz veya kullanıcı işlemi gerekli durumu korunur; başarı varsayılmaz. Aynı kaynak tekrar işlendiğinde kişi sayısı veya abonelik artmaz. Özellikle geçmiş aktarım tekrarında otomasyon/yeniden abonelik oluşturacak yazma tekrarı yapılmaz.

İstek sayısı, worker CPU/RAM, DB bağlantı bekleme süresi, kuyruk yaşı ve hata oranı ölçülür. Aynı yükte entegrasyon kapalı/açık p95 admin yanıt süresi karşılaştırılır; %10'dan büyük ve tekrarlanabilir artış kabulü durdurur. Bu eşik test kararıdır; şu an %10 veya sıfır etki ölçüldüğü iddiası değildir.

## 9. Kabul ve yayın

İzole mağaza ve sahte sağlayıcı yanıtlarıyla şu davranışlar doğrulanır:

- Yetkisiz kullanıcı, yanlış mağaza, yanlış Origin ve süresi dolmuş destek oturumu reddedilir.
- Secret gövde/log/HTML/tarayıcı deposuna sızmaz; yanlış mağaza AAD ile açılamaz.
- Hesap kimliği, key rotation, başka hesabın anahtarı, başka mağazaya bağlı hesap ve seçilmiş liste erişimi.
- İzinli bülten/müşteri/sepet kaydı, izin vermeyen kişi, tekrar adres, e-posta düzeltmesi, ret ve arşiv.
- Dış serviste daha önce çıkan/spam/bounce olan kişi tekrar abone yapılmaz; eski webhook ve eksik webhook kurtarma.
- Yerel ret zaten aktarılmış kişiyi serviste pazarlamadan çıkarır; arşiv/e-posta değişimi yalnız eski Celebix üyeliğini temizler. Klaviyo'da listede olmayan/kimliği bilinmeyen kişi yanlışlıkla global unsubscribe veya yeni profile dönüşmez.
- İlk aktarım cursor sınırı, quota, 401/403/429, timeout, provider outage, retry, lease ve double-click.
- Profil düzeltmesi diğer provider listelerini silmez; geçmiş aktarım normal yeni kayıt otomasyonu gibi sunulmaz.
- İşlem sırasında bağlantı yenileme/kaldırma/switch; yeni işler ve eskiden alınmış işlerin sonucu.
- `202` sonrasında ret/disconnect, credential rotation sırasında belirsiz sonuç, eşzamanlı dış ret ve temizleme başarısızlığı; sonuç bilinmeden yeni abonelik/switch yapılmaz.
- İki yıldan eski Brevo izinleri, önizlemede bilinmeyen engel sayısı ve tamamlanmamış polling turunda watermark korunması.
- 1440, 1024 ve 390 piksel, klavye/odak, hata sonrası seçimlerin korunması.
- Ürün, müşteri, Manuel satış, ödeme, Google bağlantıları ve mevcut e-posta işlerinin gerilememesi.

Sonra merchant tarafından izin verilmiş bir Brevo hesabı ve bir Klaviyo hesabıyla hesap/liste/kişi/ret akışı doğrulanır. Gerçek kişi aktarımı ve bunun başlatabileceği otomasyonlar mağaza tarafından Uygula ekranında onaylanır. Üretimde sahte sipariş veya izinsiz test mesajı oluşturulmaz. API anahtarı verilmediğinde uçtan uca gerçek bağlantı kabulü tamamlandı diye raporlanmaz.

Yayın öncesi güncel ortak kaynak ve devam eden yayınlar tekrar okunur; tek yayın sahibi koordine edilir. Uyumlu SQL/contracts/worker desteği, ardından ortak Customer Panel NET → SITE yayımlanır. Yeni tenantlar aynı ortak ekran ve sözleşmeden yararlanır; bağlantı mağaza kendi hesabını bağladığında oluşur. Kurulumda kendiliğinden ücretli sağlayıcı hesabı veya pazarlama izni açılmaz.

Geri alma yeni grant/import işlerini kapatır ve uyumlu önceki arayüze döner. Ret kabulü, ret kuyruğu, gönderilmiş işlerin uzlaştırılması ve bunları işleyen uyumlu minimum worker çalışmaya devam eder. Bu yol sürdürülemiyorsa dış serviste gönderimlerin durdurulması ve bekleyen retlerin uygulanması geri almanın zorunlu tamamlayıcı işlemidir; dış kampanyalar çalışırken izin aktarımı sessizce kapatılmaz. Eklenen izin/ret ve audit kayıtları veri kaybına yol açacak şekilde kaldırılmaz; gerekli credential yalnız tamamlanmamış düzeltme/temizleme bitene kadar kapatılmış olarak korunur. Dış servisteki kişiler ve kampanyalar rollback ile kendiliğinden silinmez.

## 10. Aday servislerin sonraki kabulü

MailerLite: yalnız yeni API kullanılır; Classic `/api/v2/me` yeni hesaplara uygulanmaz. API-token hesabını doğrulayacak resmi, kararlı hesap kimliği veya desteklenen OAuth akışı; ücretsiz planda kişi eşitlemesi, ret okuma ve webhook kısıtları kabul edilir. API ile gönderim bu tasarımın kapsamı olmadığından ücretli send endpoint'i gerektirmez. Hesap onayı/gönderici kontrolü ayrıca gösterilir.

Sender: ücretsiz kişi API'si ve marketing/transactional status ayrımı kullanılır. Ücretsiz webhook olmaması tek başına eleme sebebi değildir; periyodik ret kontrolü denenir. REST bearer hesabının kararlı kimliği, belgelenmiş yetki kapsamı ve rate-limit davranışı doğrulanır. Ayrı OAuth MCP hesabı, REST token kimliğiymiş gibi kullanılmaz.

Bu kabul tamamlanmadan adaylar canlıda “Bağla” düğmeli çalışan servis olarak gösterilmez. Adayların sözleşme, onboarding ve bakım maliyeti ilk iki bağlantıyla aynı kabul ölçütlerine tabidir.

## 11. Teknik kaynak ve mevcut kaynak dayanağı

İncelenen ortak kaynak: `8ec4903155e8410548e5ce60e04edf7f9b2f87b9`. Birincil çalışma dizinindeki `fe91691` daha eski bir sürüm olduğundan özellik yokluğu veya canlı durumu oradan çıkarılmadı. Bu tasarım canlı deployment state doğrulaması değildir.

Kaynak alanları: `apps/customer-panel/app/marketing/email`, `components/google-marketing`, `lib/google-marketing-http`, `packages/saas-contracts/src/customers`, `packages/saas-data/src/storefront/newsletter-repository`, `packages/saas-data/src/provider-execution/credential-crypto`, owner worker'ları ve store-engagement izin kayıtları.

Resmi teknik belgeler:

- https://developers.brevo.com/docs/oauth
- https://developers.brevo.com/reference/get-account
- https://developers.brevo.com/reference/get-contact-info
- https://developers.brevo.com/reference/update-contact
- https://help.brevo.com/hc/en-us/articles/209458705-What-is-a-blacklisted-contact-
- https://help.brevo.com/hc/en-us/articles/213405965-Build-a-legitimate-contacts-database-for-optimal-deliverability-and-compliance
- https://help.brevo.com/hc/en-us/articles/9168632514066-What-are-the-different-quotas-applied-in-Brevo
- https://developers.klaviyo.com/en/reference/get_accounts
- https://developers.klaviyo.com/en/reference/bulk_subscribe_profiles
- https://developers.klaviyo.com/en/reference/bulk_unsubscribe_profiles
- https://developers.klaviyo.com/en/reference/profiles_api_overview
- https://developers.klaviyo.com/en/reference/get_profiles
- https://developers.klaviyo.com/en/reference/webhooks_api_overview
- https://developers.klaviyo.com/en/docs/rate_limits_and_error_handling
- https://developers.mailerlite.com/api/subscribers
- https://www.mailerlite.com/help/plan-and-billing
- https://api.sender.net/authentication/
- https://api.sender.net/subscribers/get-one/

Araştırma notları ana projede `.tmp/email-campaign-research/2026-10-09` altında kayıtlıdır. Gerçek ücretsiz hesap kabulü yapılmadığı noktalar yukarıda açıkça ayrılmıştır.

Resmi logo kaynakları: Brevo press sayfasının yayımladığı `https://corp-backend.brevo.com/wp-content/uploads/2023/04/Brevo-Logo-1.svg`; Klaviyo `https://www.klaviyo.com/newsroom` başlığındaki mevcut logo SVG'si. Brevo press indirimi, bağlantı arayüzünde kullanma veya kendi sunucunda barındırma iznini açıkça belirtmiyor; kapsam yayından önce resmi marka koşulları/izinle doğrulanmalıdır. Klaviyo kullanımı `https://www.klaviyo.com/legal/api-terms` ve newsroom marka yönlendirmelerine uygun olmalıdır. Kaynağın bulunması genel bir yeniden kullanım lisansı olarak raporlanmaz.

## 2026-10-09 approved correction: manual exports

The user's explicit correction supersedes automatic first import/source update scheduling in this design. **Uygula** saves only the connection; **Eşitle** requests one finite export of the then-current proven audience. Grants, names and newly created customers wait for another explicit request. A versioned/idempotent sync command queues immutable per-job name/proof snapshots with a monotonically numbered batch. It never resets uncertain prior effects; fresh source denials still fence dispatch. Incoming denials, provider reconciliation and disconnect cleanup continue automatically. No new dependency/editor/automatic campaign sender is introduced.

The user clarified that current checkout obtains only order/contract acceptance. That is not represented as marketing consent, and no grant backfill is fabricated. Existing explicit newsletter/cart consent and attested customer evidence remain the eligibility sources. The prominent count reads “Aktarılacak müşteriler”; evidence and denial status remain factual. Checkout consent collection is a separate future feature, not silently added here.
