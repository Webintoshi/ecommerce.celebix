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
