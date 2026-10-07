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

- GTM: erişilebilir web konteyneri seçilir veya erişilebilir hesapta yeni konteyner oluşturulur. Uygula sırasında gereken ek Google izinleri istenir. Yalnız izinli yerel Google etiketleri desteklenir. Özel HTML, özel şablon ve üçüncü taraf kodu reddedilir. Canlıdan farklı yayımlanmamış sürüm varsa yayın engellenir. Başka etiketler korunur; Google publish API'sinin atomik canlı sürüm kilidi olmadığı için dışarıdan aynı anda yayın yapılmamalıdır.
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
- Güzide'nin gerçek sahip oturumunda üç **Bağlan** düğmesi kullanılabilir olarak doğrulandı. Henüz hiçbir mağazanın Google hesabına erişim izni verilmedi, GTM yayını veya site doğrulaması yapılmadı. Gerçek hesap/kaynak kabulü ve Tag Assistant/Ads tanılaması bekliyor.
- Google uygulaması, kullanıcının açık işlem anı onayıyla 8 Ekim 2026'da **Publish app → Confirm** üzerinden **External / In production** olarak yayımlandı. Audience ekranındaki durum ve **Back to testing** düğmesi doğrulandı; özel kanıt `google-in-production.jpg` dosyasında saklandı. Önceki 403 istemcisi özel yapılandırmayla eşleşiyordu; test listesi başlangıçta boşken sonraki kontrolde `celebixco@gmail.com` görünmüştü. Ajan test kullanıcısı eklemedi veya mağazanın Google veri iznini vermedi. Artık test kullanıcı listesi yayına erişimin koşulu değildir; onaysız hassas kapsamlar için görünen 100 kullanıcı sınırı devam ediyor.
- Mevcut herkese açık Celebix tanıtım sayfası `https://celebix.net/tr/e-ticaret-paketleri`, gizlilik `https://celebix.net/tr/gizlilik` ve kullanım koşulları `https://celebix.net/tr/kullanim-kosullari` Google Branding'e kaydedildi; başarı bildirimi doğrulandı. Authorized domain `celebix.net` korundu. Üretim yayını sonrası Verification Center, markanın henüz doğrulanıp yayımlanmadığını ve veri erişiminin doğrulanmadığını gösteriyor; **Prepare for verification** marka doğrulanana kadar kapalı. Mevcut gizlilik metni Google API verilerinin kullanımını özel olarak açıklamıyor; doğru veri kullanımı eki yerel, yayımlanmamış taslak olarak hazırlandı. Genel Google kabulü tamamlandı sayılmıyor. Güzide'nin son gerçek panel kontrolünde üç hizmet de **Bağlı değil**; gerçek hesap/kaynak seçimi ve ölçüm kabulü bekliyor.
- Ads API'nin gerçek Cloud ekranında erişim **Test** olarak görüldü. Tüm mağazalara açık kullanım için doğrulanmış marka/kapsamlar ve Ads projesinde Explorer veya üstü erişim hâlâ gerekir; OAuth üretim yayını bu koşulları tamamlamaz. Test ve üretim Google projeleri ayrı tutulacak. Önceki test modunda verilmiş kimlik dışı yenileme anahtarlarının yedi günlük süresinin yayınla kendiliğinden uzadığı varsayılmayacak. [OAuth üretim koşulları](https://developers.google.com/identity/protocols/oauth2/production-readiness/policy-compliance), [Ads erişim seviyeleri](https://developers.google.com/google-ads/api/docs/api-policy/access-levels).
- Özel yayın kanıtları, veritabanı yedeği ve canlı ekran görüntüsü çalışma ağacındaki `.tmp/google-marketing-release-20261008/` altında tutulur; gizli kaynaklar repoya eklenmez. Yerel arayüz test sunucusu kapatıldı, yeniden üretilebilir derleme önbellekleri temizlendi.
