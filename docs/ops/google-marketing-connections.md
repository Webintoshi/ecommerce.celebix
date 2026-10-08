# Ortak Google bağlantıları

Mağaza yöneticisi bağlantıları **Pazarlama → Google Bağlantıları** (`/marketing/google`) üzerinden yönetir. Rapor veya serbest kod alanı yoktur. Aynı ortak uygulama yeni mağazalarda da kullanılabilir; Google hesabı ve kaynak seçimi her mağazaya aittir.

## Merkezi yapılandırma

İki ortak admin için aynı Google Cloud OAuth istemcisi kullanılır. Özel anahtarlar yalnız sunucu ortamında tutulur:

- `CELEBIX_GOOGLE_OAUTH_CLIENT_ID`
- `CELEBIX_GOOGLE_OAUTH_CLIENT_SECRET`
- `CELEBIX_GOOGLE_OAUTH_ORIGIN=https://panel.saas-staging.celebix.net`
- `CELEBIX_GOOGLE_ADS_PROJECT_ID`

OAuth dönüş adresi: `https://panel.saas-staging.celebix.net/api/marketing/google/callback`. Ortak Google Cloud projesi: `utility-liberty-510921-b6` (Celebix Google Connections). GTM, Google Ads, Search Console ve Site Verification API'leri gerekir. API anahtarına veya mağaza başına ayrı OAuth projesine ihtiyaç yoktur.

Google veri politikası kabulü, OAuth istemcisi, gerekli kapsamlar, test kullanıcıları ve gerçek hesap kabulü tamamlanmadan bağlantı aktif sayılmaz. Google'ın harici uygulama doğrulaması ve Ads üretim API erişimi, Google tarafından verilen ayrı izinlerdir. Test modundaki uygulama tüm mağazalara açık üretim uygulaması olarak sunulmaz. Eksik merkezi ayarlar admini durdurmaz; ekranda yapılandırmanın beklediği gösterilir.

## Yetki ve kullanıcı akışı

Google hesabına giriş, mağazanın mevcut admin oturumu üzerinden başlar. İstek mağaza, çalışan, oturum, dönüş alan adı ve on dakikalık tek kullanımlık duruma bağlanır. Destek erişimi tamamlamada yeniden doğrulanır. Kimlik bilgileri mağaza ve servisle bağlı AES-GCM şifrelemesiyle saklanır; istemciye erişim/yenileme anahtarı verilmez.

- GTM: ilk Google bağlantısı okuma, konteyner düzenleme, sürüm oluşturma ve yayınlama izinlerini birlikte ister; eksik izinle bağlantı tamamlanmaz. Erişilebilir web konteyneri seçilir veya erişilebilir hesapta yeni konteyner oluşturulur. Eski yalnız okuma yetkili bağlantılar için ek izin tamamlama yolu korunur. Yalnız izinli yerel Google etiketleri desteklenir. Özel HTML, özel şablon ve üçüncü taraf kodu reddedilir. Canlıdan farklı yayımlanmamış sürüm varsa yayın engellenir. Başka etiketler korunur; Google publish API'sinin atomik canlı sürüm kilidi olmadığı için dışarıdan aynı anda yayın yapılmamalıdır.
- Ads: etkin, web sitesi türündeki satın alma dönüşümü seçilir. Etiketin gerçek `AW-` kimliği ve dönüşüm etiketi kullanılır. Kampanya, bütçe veya ödeme ayarı değiştirilmez.
- Search Console: mağazanın doğrulanmış ana alan adıyla eşleşen site seçilir. Yeni URL-prefix site için Google META doğrulaması ve sitemap gönderimi yapılır. DNS domain doğrulaması ilk sürümde otomatik değildir. Doğrulama gecikirse aynı işlem yeniden denenir.

Uygula doğrudan kayıt ve sağlayıcı işlemini başlatır. Vazgeç seçimi bırakır. Ağ hatalarında işlem kimliği ve seçim korunur. Kaynağı değiştiren yeni işlem, bilinmeyen eski sonucu sessizce ezmez.

## Vitrin ve ölçüm

Google etiketi olmayan mağazada Google betiği veya ilave tarayıcı ölçüm isteği yüklenmez. Etiketler yalnız ziyaretçinin açık çerez izninden sonra yüklenir; ret varsayılandır ve izin geri çekilebilir. Gönderilen e-ticaret olaylarında müşteri adı, e-posta, telefon veya adres bulunmaz.

Satın alma için yalnız süreli, mağazaya bağlı hosted-checkout makbuzunun doğruladığı canlı `captured` ödeme ve `completed` WEB siparişi kullanılır. POS, bekleyen, test, iade/iptal ve süresi dolan kayıtlar dönüşüm oluşturmaz. Sipariş kimliği Google transaction ID olarak kullanılır; istemci tekrarları da engellenir. Gerçek Google kabulü için izinli canlı mağazada Tag Assistant ve Ads dönüşüm tanılama kontrolü gerekir; üretimde sahte tahsilat oluşturulmaz.

## Yayın ve geri alma

SQL220 yalnız dört Google tablosu ve altı yeni fonksiyon ekler. Önce yedek ve izole up/down/reapply kanıtı alınır; sonra ortak vitrin NET → SITE ve admin NET → SITE yayımlanır. Mevcut PayTR kanıtları, ortam bayrakları, ödeme işlevleri ve kullanıcı verileri korunur. İzole SQL assertion dosyası üretimde çalıştırılmaz.

Geri almada önce önceki uygulama kaynaklarına dönülür. Google bağlantıları kullanılmaya başlandıysa veriyi silen down dosyası çalıştırılmaz; anahtarların ve bağlantı kayıtlarının korunması gerekir.

## 2026-10-08 yazılım yayını ve kalan aktivasyon

- Canlı kaynak: `9dcdbd721a50390c18a00e90d45eaafe85cec907`. Vitrin NET → SITE, ardından admin NET → SITE yayımlandı; dört çalışan görüntü, kaynak manifesti ve derlenmiş Google/ödeme okuyucuları doğrulandı. Yayın kuyruğu boş.
- SQL220 eklendi. Önce tam yedek ve izole geri alma/yeniden uygulama yapıldı; mevcut 333 tablonun verisi ve 1701 fonksiyonun tanımı/yetkileri korundu. Dört Google tablosu ve altı fonksiyon eklendi. Üretimde finansal test kaydı veya sağlayıcı işlemi oluşturulmadı.
- 62 odaklı Google testi ve iki uygulama derlemesi geçti. Masaüstü ve mobil arayüz kabulü yapıldı. Güzide, Alpler, Lilyum ve Butik Siora'da oturum koruması, güvenli callback, anonim satın alma yanıtı ve yapılandırılmamış vitrinde Google yüklenmemesi doğrulandı. Güzide'de mevcut sahip oturumuyla yeni menü ve kartlar kontrol edildi.
- PayTR kaynakları, mevcut izinler, ortam değerleri ve bayrakları korundu. Bu yayın gerçek bir ödeme denemesi yapmadı.
- Kullanıcının işlem anındaki onayıyla `Celebix Shared Admin` web OAuth istemcisi oluşturuldu. Tek dönüş adresi yukarıdaki ortak callback'tir. Tag Manager, Google Ads, Search Console ve Site Verification API'leri Google Cloud'da etkin olarak doğrulandı; kimlik, GTM, Ads ve Search Console kapsamları kaydedildi.
- Merkezi sunucu yapılandırması iki ortak admin üzerinde **aktif**. Aynı yazılım kaynağında NET (`curylcef4zq4mxqhn32lmwus`) → SITE (`d64uaff8c8c4dvdfap4il4v6`) yayımlandı. Özel ayarların geri alma provası, iki çalışan panelin kaynak/şifreleme/ödeme kontrolleri ve dört mağazanın oturum/callback koruması geçti; son kontrol kuyrukların boş olduğunu doğruladı. Yalnız sekiz normal Google runtime ortam kaydı eklendi; preview kayıtları, mevcut şifreleme anahtarları, ödeme bayrakları ve iki vitrin korunmuş durumdadır.
- Güzide'nin gerçek sahip oturumunda üç **Bağlan** düğmesi kullanılabilir olarak doğrulandı. Bu ilk aktivasyon kontrolünde henüz mağaza Google izni, GTM yayını veya site doğrulaması yoktu. Sonraki Search Console denemesi aşağıdaki düzeltme kaydında belirtilmiştir; GTM/Ads kaynak ve ölçüm kabulü bekliyor.
- Google uygulaması, kullanıcının açık işlem anı onayıyla 8 Ekim 2026'da **Publish app → Confirm** üzerinden **External / In production** olarak yayımlandı. Audience ekranındaki durum ve **Back to testing** düğmesi doğrulandı; özel kanıt `google-in-production.jpg` dosyasında saklandı. Önceki 403 istemcisi özel yapılandırmayla eşleşiyordu; test listesi başlangıçta boşken sonraki kontrolde `celebixco@gmail.com` görünmüştü. Ajan test kullanıcısı eklemedi veya mağazanın Google veri iznini vermedi. Artık test kullanıcı listesi yayına erişimin koşulu değildir; onaysız hassas kapsamlar için görünen 100 kullanıcı sınırı devam ediyor.
- Mevcut herkese açık Celebix tanıtım sayfası `https://celebix.net/tr/e-ticaret-paketleri`, gizlilik `https://celebix.net/tr/gizlilik` ve kullanım koşulları `https://celebix.net/tr/kullanim-kosullari` Google Branding'e kaydedildi; başarı bildirimi doğrulandı. Authorized domain `celebix.net` korundu. Üretim yayını sonrası Verification Center, markanın henüz doğrulanıp yayımlanmadığını ve veri erişiminin doğrulanmadığını gösteriyor; **Prepare for verification** marka doğrulanana kadar kapalı. Mevcut gizlilik metni Google API verilerinin kullanımını özel olarak açıklamıyor; doğru veri kullanımı eki yerel, yayımlanmamış taslak olarak hazırlandı. Genel Google kabulü tamamlandı sayılmıyor. Bu üretim yayını kontrolündeki bağlantısız durum, sonradan verilen Güzide Search Console izninden öncedir; güncel deneme aşağıda belirtilmiştir. GTM/Ads kaynak ve ölçüm kabulü bekliyor.
- Ads API'nin gerçek Cloud ekranında erişim **Test** olarak görüldü. Tüm mağazalara açık kullanım için doğrulanmış marka/kapsamlar ve Ads projesinde Explorer veya üstü erişim hâlâ gerekir; OAuth üretim yayını bu koşulları tamamlamaz. Test ve üretim Google projeleri ayrı tutulacak. Önceki test modunda verilmiş kimlik dışı yenileme anahtarlarının yedi günlük süresinin yayınla kendiliğinden uzadığı varsayılmayacak. [OAuth üretim koşulları](https://developers.google.com/identity/protocols/oauth2/production-readiness/policy-compliance), [Ads erişim seviyeleri](https://developers.google.com/google-ads/api/docs/api-policy/access-levels).
- Özel yayın kanıtları, veritabanı yedeği ve canlı ekran görüntüsü çalışma ağacındaki `.tmp/google-marketing-release-20261008/` altında tutulur; gizli kaynaklar repoya eklenmez. Yerel arayüz test sunucusu kapatıldı, yeniden üretilebilir derleme önbellekleri temizlendi.

## 2026-10-08 Search Console META yanıtı düzeltmesi

- Güzide’de kullanıcı `celebixco@gmail.com` hesabına Search Console iznini verdi. Site doğrulama işlemi `provider_unavailable` sonucuyla durdu; sunucuya alınan gerçek Google getToken yanıtı HTTP200 ve tam META etiketi içeriyordu. Eski okuyucu yalnız çıplak doğrulama değeri bekliyordu.
- Okuyucu artık yalnız güvenli, sınırlı `content` değerini çıkartır; sağlayıcı HTML’sini kaydetmez veya vitrinde enjekte etmez. Beklenen dışı/çift öznitelikler, çalıştırılabilir HTML ve geçersiz uzunluklar reddedilir. Eski çıplak değer, mevcut kontrol noktası ve aynı işlemden tekrar deneme korunur.
- Kaynak düzeltmesi `e02b313068e47d7e79d689a4033fee6a1f0c2ea5` ile ortak admin NET (`tj4pknl69xk1t3pu9bzlx7m7`) → SITE (`gpm1mfh6nuwcr82n8zkrhvn5`) yayımlandı. Vitrinler mevcut `9dcdbd721a50390c18a00e90d45eaafe85cec907` kaynağında ve aynı çalışan konteynerlerde kaldı.
- 38 odaklı test, veri paketi tip kontrolü, admin üretim derlemesi ve bağımsız inceleme geçti. Dört mağazanın erişim/callback HTTP kabulü, çalışan kaynak, ödeme yetkileri, Google yapılandırması, anahtarlar ve tüm diğer ortam kayıtlarının korunması doğrulandı. Geri alma provası geçti; son yayın kontrolünde global kuyruk boştu. Yeni SQL veya ortam kaydı eklenmedi.
- Kullanıcı Güzide’ye giriş yaptı ve `celebixco@gmail.com` hesabında site sahipliği doğrulaması ile site haritası gönderimine açık onay verdi. Bu denemede bulunan ikinci veritabanı sorunu aşağıdaki SQL221 düzeltmesiyle çözüldü. Gerçek Google kabulü tamamlandı; marka/kapsam doğrulaması ve Ads üretim erişimi ayrı bekleyen koşullardır.
- Özel kaynak/yayın/kabul kanıtı `.tmp/google-marketing-meta-fix-20261008/` altında; kimlik bilgileri repoya eklenmez.

## 2026-10-08 Search Console kontrol noktası ve canlı kabul

- SQL220 kontrol noktası doğrulamasındaki `p_input->'progress'-ARRAY[...]` ifadesi, işlem önceliği nedeniyle `invalid_input` üretiyordu. Gerçek yerel ve canlı salt okunur sorguda neden doğrulandı. SQL221, yalnız bu ifadeyi `(p_input->'progress')-ARRAY[...]` olarak değiştirir; tam eski fonksiyon tanımı, OID ve yetkiler kontrol edilir. Eski SQL220 dosyası değiştirilmedi. Kaynak: `b9121c224e45f8ddc782a132f1e3ce6c2130f727`.
- İzole PostgreSQL’de gerçek claim → checkpoint → META çıktısı → aynı işlemden tekrar deneme → verified checkpoint → finalize → replay test edildi. Eski sürüm RED, düzeltme GREEN, tekrar uygulama GREEN, geri alma RED ve yeniden uygulama GREEN oldu. 333 eski/337 toplam tablonun verileri ve 1707 fonksiyonun katalog özellikleri korundu; geçici cluster durdurulup silindi. Bu test Google API’sini veya üretim verisini değiştirmedi.
- İlk canlı dispatch, Coolify’nin 00:01:04 UTC’de yeniden başlamasıyla kaybolan geçici ortak kilit nedeniyle **SQL başlamadan** durdu. Eski seal/dispatch kaydı korunarak kilit UID9999 ve 0700/0600 izinleriyle yeniden kuruldu. Yeni açık kök incelemesi; güncel özel yapılandırma, eski activation verisiyle beklenen farklar ve dört uygulamanın aynı kaynak/ödeme/Google/keyring/runtime env kanıtlarına bağlandı. İlk fingerprint’in ham eski kaydı bulunmadığı için yalnız fingerprint farkının nedeni tahmin edilmedi.
- Yeni korumalı işlem SQL221’i ortak veritabanına uyguladı. İşlem içindeki 337 tablo kimliği/satır hashleri değişmedi; diğer 1706 fonksiyonun tam tanımı ve tüm fonksiyonların yetkileri/katalog özellikleri korundu. Yapılandırma aynı kaldı, global kuyruk boştu. SQL değişikliği için uygulama yayını, yeni ortam kaydı veya kaynak pin değişikliği gerekmedi; adminler e02, vitrinler 9dc kaynağında kaldı.
- Güzide’nin gerçek Chrome sahip oturumunda **Uygula** başarıyla tamamlandı: **Bağlantı uygulandı / Bağlı**, doğru Google hesabı ve `https://guzidekuyumcu.com/` görüldü. İşlem `5f113d83-d655-4b65-8c2c-249a7e9d1787` complete, verified=true, bağlantı sürümü1 ve tek apply kaydı olarak doğrulandı. Google’ın META sahiplik doğrulaması, Search Console site ekleme ve sitemap gönderme çağrıları başarılı olduktan sonra bu sonuç kaydedildi.
- Anonim ana sayfa HTTP200 ve kayıtlı değerle eşleşen tek doğrulama META etiketi; `/sitemap.xml` HTTP200 ve geçerli sitemapindex olarak kontrol edildi. Bağlantıda hata kodu yok. Google’ın sitemap’i kabul etmesi, içeriğin hemen indekslendiği anlamına gelmez.
- Özel native/test kanıtları `.tmp/google-marketing-checkpoint-fix-20261008/`, açık recovery/canlı kabul ve ekran görüntüsü `.tmp/google-marketing-checkpoint-recovery-20261008/` altında tutulur. GTM/Ads bağlantısı ve genel Google marka/kapsam/Ads erişim kabulü bu Search Console çalışmasından ayrı bekler.

## 2026-10-08 GTM hesap oluşturma girişi ve gizlilik

- Ortak admin `625644c075c78438a725eb654f3ea895d4494716`, NET `hv3d3z80r50x17ctlne38ap4` → SITE `hxnaqa3b2mk5ftimei5xuym7` ile yayımlandı. İki panelin gerçek JS çıktısı, çalışan kaynakları, ödeme/Google/keyring/ham ortam koruması ve iki değişmeyen 9dc vitrin doğrulandı; son kontrol global idle. Yeni SQL veya ortam satırı yoktur.
- GTM penceresinde **Yeni Tag Manager hesabı oluştur**, resmî Google arayüzünü yeni sekmede açar; Google'da hesabı oluşturduktan sonra panelin listesi yenilenir. GTM accounts API hesap oluşturmayı sunmaz. Etiket **Tag Manager hesabı** oldu; mevcut mağaza konteyneri oluşturma seçeneği korunur. Bütün Google pencerelerinde canlı gizlilik bağlantısı bulunur.
- 24 davranış testi, üretim derlemesi, bağımsız inceleme ve Güzide'nin gerçek Chrome hesabında bağlantı/yenileme/seçim/Vazgeç kabulü geçti. Bu kabul Google'da konteyner oluşturmadı veya Uygula/yayın yapmadı. Yeni ek için 390 piksel viewport denemesi 1680 gerçek genişliği değiştirmedi; mobil canlı kabulü tamamlandı denmez.
- Kullanıcının onayladığı Google gizlilik eki kamu sitesinde `55369e5f8da743d2805a60ae916d985dc3d62d9d` ile canlıdır. Önceki gerçek canlı taban 7455 korunarak yalnız gizlilik yayımlandı; public main 0f505 üzerindeki diğer blog/middleware işleri yayımlanmadı. Sonraki main yayını aynı eki içeren b90c627 adayını da korumalıdır.
- Google marka yayımlaması tamamlandı; hassas kapsam incelemesi gönderilmedi. Kullanıcının 24,61 saniyelik kaydı giriş/izin/listenin bir kısmını gösterir; kurulum sonucu ve Ads kanıtı eksiktir, ilgisiz kimlikler de içerdiğinden YouTube'a yüklenmedi. Güncel durum ve kalan adımlar `google-oauth-verification-2026-10-08.md` içindedir.

## İlk GTM bağlantısının izinleri ve vitrin yaşam döngüsü düzeltmesi

Kullanıcı Güzide bağlantısını kaldırıp tek Google izin adımından yeniden kurmak istedi. İlk GTM OAuth isteği okuma, konteyner düzenleme, sürüm oluşturma ve yayınlama kapsamlarını birlikte ister. Başka hizmetlerin Ads veya Search Console kapsamları bu isteğe eklenmez. Eksik GTM kapsamı olan yeni callback, kısmi erişimi kaydetmeden reddedilir; eski yalnız okuma bağlantılarının bir defalık izin tamamlama yolu korunur.

Vitrin istemcisi etiket kimliği değiştiğinde eski yapılandırmayı tutmaz. Henüz yükleme başlamadıysa yeni yapılandırmayı kullanır; yükleme başladıysa eski olayları ve callbackleri durdurup yeni belgeye geçer. Bağlantı kaldırılıp bileşen kapandığında aynı temizleme uygulanır. Normal sayfa geçişi, RSC nonce değişimi, aynı değerlerle yeni nesne ve Search Console doğrulama değişimi ikinci betik veya yenileme oluşturmaz. İlk mount sırasında mevcut belgenin betik nonce değeri ile gelen yapılandırma uyuşmazsa Google istemcisi oluşturulmadan yeni belge açılır; eski CSP ile kurulum başlamaz. Çerez izni olmadan etiket yüklenmez.

Düzeltme hazırlanırken gerçek Chrome'da GTM **Bağlı değil**, Search Console **Bağlı** görüldü; açık vitrinde GTM betiği yok ve bir doğrulama meta alanı var. Yeni kurulumun gerçek sağlayıcı ve çerez izin kabulü, kullanıcının yeniden bağlantısından sonra tamamlanmalıdır. Statik HTML içinde GTM betiğinin olmaması tek başına kurulum hatası kanıtı değildir.
