# Otomatik mağaza kaydı — gerçek hesap çalışması

## Kapsam

İstenen Alpler Spor hesabını normal `/kayit` ve Logto akışıyla oluşturma, gözlenen başlangıç sorunlarını düzeltme, ortak NET/SITE kayıt panellerini yayınlama. İlk mağaza ortak uygulamalara bağlanır; ayrı Coolify uygulaması açılmaz. Gerçek deneme ortak DNS/TLS wildcard ön koşullarının eksik olduğunu gösterdi. Pazarlama onayı, gerçek sipariş/ödeme veya ücretli plan işlemi yok.

## Düzeltmeler

- SQL166 yeni aktif canonical platform adreslerini modern storefront authority kaydına atomik bağlar: `<slug>.saas-staging.celebix.net`, `<slug>.saas-staging.celebix.site`, `<slug>.celebix.site`. Diğer adresler kabul edilmez; mevcut mağazalar topluca backfill edilmez.
- Yeni schema4 başlangıç tasarımı hem taslak hem yayın kurallarını geçer. Görselsiz hero ve boş duyuru başlangıçta kapalıdır; mevcut tasarım/sürüm/yayınlar değiştirilmez.
- Geçici runtime/discovery hataları coalesced ve1–30s beklemeli istek üzerinden yeniden denenebilir; JWKS5min yenilenir, bilinmeyen imza anahtarı için30s cooldown ve tek doğrulama tekrarı vardır. Token exchange tekrarlanmaz. İmza/issuer/audience/nonce kontrolleri korunur.
- Etkin kayıt ekranı gerçek mağaza oluşturma akışını açıklar, yapılandırılmış alan adını gösterir; ödeme/kargo ayarlarını kullanıcının tamamlaması gerektiğini belirtir.
- Kayıt `prompt=login` ile güncel kimlik doğrulaması ister; farklı açık SSO hesabı sessizce mağaza sahibi yapılmaz. Prompt eksik sağlayıcı URL’si reddedilir.
- Gerçek canlı yayın ön kontrolünde eski SQL148 assertion, Siora published_version3 olmasına rağmen sürüm1 şartıyla başarısız oldu. Yalnız okuma kontrolü herhangi geçerli yayın sürümünü (>=1) kabul edecek şekilde düzeltildi; yetki/domain ve public resolver kontrolleri korunur.
- Test fixture sağlayıcıları bu protokole uyar. Mevcut CSP testinin boşluk ve önceden var olan vendor iframe beklentisi güncellendi; güvenlik başlığı üretim kodu değişmedi.

## Doğrulama

- Owner genel suite: **746/746 PASS**, nötr test build metadata ile. Önceki çalışmada743/745: iki başarısızlık mevcut compiled payment authority artifact’ına bağlıydı; nötr artifact ile ilgili17/17 ve son genel suite başarılı. Test için üretilen metadata dosyaları kaynak commit öncesi birebir eski haline geri döndürüldü.
- Auth runtime grubu: **59/59 PASS**. İlk çalışmadaki CSP beklentisi önceki kaynakta da çift boşluk/mevcut PayTR iframe politikasına uymuyordu.
- Prompt/HTTP/binding/composition entegrasyonu: **23/23 PASS**; signup prompt regresyonları önce başarısız, sonra44/44 OIDC başarılı.
- SQL artifact grubu: **219/219 PASS**. ExactPG16 QA kopyasında davranış ve up/down/up döngüsü başarılı; schema search_path farklılığı için bulunan rollback metadata sorunu OID eşleme ve canonical search_path ile düzeltildi.
- Owner typecheck: PASS. Owner üretim derlemesi: exit0,29/29 sayfa, tracing tamamlandı.
- Private pre166 dump restore edilmiş izole `celebix_onboarding_qa_20260927` kullanıldı; canlı SQL worker tarafından çalıştırılmadı.

## Gerçek kullanıcı akışı

İlk salt okunur kontrolde istenen principal/active owner membership ve slug için mağaza bulunmadı. Kullanıcı gerekli kayıt metinlerini açıkça kabul etti; yalnız gerekli checkbox seçilip normal kayıt gönderildi. Logto e-postayı kullanıcı adı olarak reddetti. Aşağıdaki kimlik yapılandırması düzeltildi. Kullanıcı ilk posta kutusuna erişemediği için kendi belirttiği başka bir adresi kullandı; gelen gerçek kod normal doğrulama ekranına girildi ve ilk parola kurulumuyla kayıt tamamlandı. **Hesap ve Alpler Spor tenant'ı oluştu.** Admin yönlendirmesi DNS hatası verdi; adreslerin DNS/TLS kurulumu ve tarayıcı E2E doğrulaması sürüyor. Şifre, kod ve kimlik tokenları dosya veya raporlara yazılmaz.

## Yayın

İncelenmiş kaynak **7d1230e1182c7d7cdf9d7484d4a3319ae9f9640e** iki Owner uygulamasında yayınlandı. Resmi Coolify kuyruğu kullanıldı; Auto Deploy/Preview kapalı kaldı, mevcut alan adları/hooks ve diğer env/settings nitelikleri korundu. Yalnız kaynak dalı/pin, normalSOURCE_COMMIT ve mevcut iki sandbox evidence binding değeri yeni kaynağa bağlandı; preview kayıtları değişmedi.

| Hedef | Dağıtım | Sonuç | Kanıt |
|---|---|---|---|
| NET Owner | koy5pzhi2g630dt44tpvasqm | finished,17:51:35UTC | [Deployment](evidence/automatic-store-onboarding/deployment-owner-net.json), [runtime9/9hash+compiledroutes](evidence/automatic-store-onboarding/runtime-owner-net.json) |
| SITE Owner | kwhto9b5u7ygec1gv3u49v0x | finished,17:54:34UTC | [Deployment](evidence/automatic-store-onboarding/deployment-owner-site.json), [runtime9/9hash+compiledroutes](evidence/automatic-store-onboarding/runtime-owner-site.json) |

[Son configuration guard](evidence/automatic-store-onboarding/final-config-preservation.json):2/2target,globalIdletrue. Running image etiketleri veSOURCE_COMMIT aynı7d1230e1 kaynağı gösterir. [Ödeme yetkisi korunması](evidence/automatic-store-onboarding/payment-authority-preservation.json): eski image’ların network-none salt okunur metadata kontrolü NETIyzico/PayTR kapalı, SITEIyzico kapalı/PayTR mevcut test scope açık/Live kapalı olduğunu doğruladı. Yeni image’lar aynı kapsamları korur; ödeme çalıştırılmadı.

NET `/kayit` tarayıcıda yeni etkin metin/form/domain suffix ile doğrulandı; Alpler Spor adı ve slug yeniden girildi, iki checkbox kapalı. SITE dahil sekiz salt okunur [yayın sonrası](evidence/automatic-store-onboarding/post-release-health.json) ve [SQL166 sonrası](evidence/automatic-store-onboarding/post166-health.json) health/kayıt ekranı kontrolü başarılı. Bunlar gerçek kullanıcı hesabı/E2E kaydının yerine geçmez.

### Canlı SQL166

[Son özel yedek](evidence/automatic-store-onboarding/fresh-pre166-backup.txt)17:57:17UTC alındı; pg_restore TOC kontrolü başarılı. SQL166 up+assertions [exit0 tamamlandı](evidence/automatic-store-onboarding/live166-apply.log). Yeni function/backup/trigger/ACL assertion başarılı. [Canlı karşılaştırma](evidence/automatic-store-onboarding/live166-preservation-result.json)10/10tasarım,10legacydomain,6publicdomain,4admindomain için tüm satır hash’lerini ve sayıları birebir doğruladı. SQL mevcut merchant tasarımlarını, sürümleri veya adresleri değiştirmedi.

[Temizlik](evidence/automatic-store-onboarding/cleanup.json): yalnız bu çalışmanın QA veritabanı aktif bağlantı0 doğrulanıp FORCE kullanmadan kaldırıldı; Coolify geçici helper klasörü kaldırıldı. İki özel dump, tam şifreli ayar snapshot’ı ve deployment sahiplik makbuzu sunucuda0600korundu; hash’ler yeniden eşleşti. Canlı veritabanına drop, global container/image/volume/cache temizliği yapılmadı.

### Gerçek denemede bulunan Logto eksikleri

- Ortak Celebix Logto **1.41.0**, `default` tenant, yalnız kullanıcı adıyla kayıt/giriş yapılandırılmış; e-posta connector sayısı **0**. Gerçek hata: “Kullanıcı adı yalnızca harf,sayı veya alt çizgi içermeli.” Diğer projelerin Logto servislerine dokunulmadı.
- Mevcut merkezi Celebix Resend göndericisi `hesap@noreply.celebix.net` ve aynı doğrulanmış alan adına ait gönderim anahtarı kullanıldı. Anahtar rapora/repoya/loglara yazılmadı. SMTP465 bağlantı zaman aşımına uğradı; sağlayıcının resmi alternatif **2465** portunda TLS ve SMTP kimlik doğrulaması başarılı oldu. Bu kontrol e-posta göndermedi.
- Tam özel Logto yedeği0600 alındı: SHA256 `36563aaf74fe69aa151e548a400ca6fc69f3f50082e7eca0dd4e297dfab69184`. Kurulu SMTP factory configGuard doğrulamasından geçen tek connector, başlangıç connector sayısı0 ve deneyim hash’i doğrulanan işlemde eklendi. Dokuz kullanım şablonu Türkçe ve `{{code}}` içerir; debug/logger kapalı, TLS doğrulaması açık, URL/dosya erişimi kapalı.
- Yetkili mevcut Logto Console oturumunda desteklenen kayıt ayarı kaydedildi: yeni kayıt **email + password + verify**; mevcut username/password giriş yöntemi korunup email/password eklendi. Username+email birlikte seçilmedi: bu sürümde username önceliği doğrulanmış e-posta zorunluluğunu sağlamaz. Eksik e-postası olan eski hesaplar girişte doğrulama tamamlamak zorunda kalabilir; gereklilik ortak tenant’taki uygulamalar için geçerlidir.
- Console’un ilgisiz pasif renk/social/passkey varsayılanlarını normalize ettiği görüldü; bu üç alan yedekten guard ile birebir geri alındı. Diğer `default` ayarlarının hash’i **f37a06cae0d923a079168816e45eafde**, `admin` deneyim hash’i **9e7f4ea31c46be89ba17bd35b48e1b5b** ve5 uygulamanın hash’i **88b177397a1901c0b52550f80de9d432** başlangıçla aynı. MFA, parola politikası, hukuki metinler ve diğer güvenlik ayarları korunur.
- Yeni normal `/kayit` akışı e-posta formunu ve gerçek altı haneli kod ekranını gösterdi: “Doğrulama kodu … adresinize gönderildi.” Bu, Logto gönderim adımının başarılı olduğunu gösterir; **gelen kutusuna teslimat kanıtı değildir**. Kullanıcı posta kutusuna şu anda erişemiyor. E-posta içeriği veya backend doğrulama kodu okunmadı; doğrulama atlanmadı.
- Son salt okunur kontrol18:25UTC: istenen Logto kullanıcı0, SaaS principal0, istenen slug mağaza0. Yeni admin/storefront E2E henüz yapılamadı.

Resmi kaynaklar: [Logto signup](https://docs.logto.io/end-user-flows/sign-up-and-sign-in/sign-up), [Logto1.41.0 validation](https://github.com/logto-io/logto/blob/v1.41.0/packages/core/src/routes/experience/classes/libraries/sign-in-experience-validator.ts), [SMTP](https://resend.com/docs/send-with-smtp). Bağımsız ajan incelemesi kurulu sürümün mandatory identifier, connector ve cache koşullarını doğruladı. Bu adım kaynak uygulama derlemesi/deploy gerektirmeyen canlı kimlik yapılandırması düzeltmesidir.

### Gerçek hesap tamamlandı; DNS hazır, HTTPS kurulumu bekliyor

Kullanıcıdan alınan gerçek e-posta kodu doğrulandı, ilk hesap parolası normal ekranda oluşturuldu. [Salt okunur canlı kanıt](evidence/automatic-store-onboarding/alpler-spor-account.json): tek aktif Alpler Spor mağazası, doğrulanmış aktif mağaza sahibi, ücretsiz başlangıç aboneliği, eşleşen legacy/modern storefront alan adı, doğrulanmış admin alan adı ve aktif medya namespace'i hazır. Başlangıç tasarımı schema4, taslak/yayın sürümü1, aynı config ve yayınlanabilir durumdadır. Kayıt işlemi committed/ready, workflow tenant_created/completed; bir redeemed registration handoff ve bir aktif panel session kaydı vardır. Bunlar tarayıcıda admin erişiminin doğrulandığı anlamına gelmez.

[Güvenilen origin HTTP kontrolü](evidence/automatic-store-onboarding/pre-wildcard-internal-storefront.json) mevcut Siora ve yeni Alpler Spor için200/doğru mağaza başlığını doğruladı. Olmayan slug için SQL resolver not_found iken stream edilen Next sayfası HTTP200/“Mağaza bulunamadı” döndürdü; erken proxy404 düzeltmesi eklendi. Admin root/login de bilinmeyen adresi girişe yönlendirdiği için exact persisted host kapısı eklendi. Yeni kapı API/auth/handoff/health yollarını korur; development modundaki yalnız exact loopback3400 adresleri yerel geliştirme için korunur. Wildcard router adayı ayrı NET/SITE servisleri ve mevcut Docker storefront authority middleware'lerini kullanır; secret tekrar edilmez, mevcut exact platform router'ları daha yüksek öncelikte kalır. Bu aday henüz canlıya kurulmadı.

Kullanıcının Cloudflare girişi sonrasında NET mağaza ve admin wildcard A kayıtları ile eksik SITE admin wildcard kaydı desteklenen DNS ekranından eklendi; mevcut SITE mağaza wildcard kaydı korundu. Üç yeni kayıt DNS only/Auto ve mevcut Celebix sunucusuna yöneliyor. Alpler Spor'un iki NET adresi artık DNS'te çözülüyor. [DNS değişiklik kanıtı](evidence/automatic-store-onboarding/wildcard-dns-changes.json) kayıt kapsamını gösterir.

Mevcut proxy yalnız tekil sertifikalarla HTTP01 kullanıyor. Dört staging wildcard sertifikası için ayrı DNS challenge resolver ve sekiz ortak HTTP/HTTPS router adayı hazırlandı; mevcut exact router'lar, HTTP01 resolver ve sertifika deposu korunuyor. Compose doğrulaması başarılı; adaylar henüz etkinleştirilmedi. Proxy compose/dynamic/ACME ve SITE DNS kayıtlarının özel yedekleri alındı. Önceki Cloudflare anahtarı yalnız SITE DNS okuyabiliyor; NET erişimi/DNS yazma yetkisi yok. İki zone için DNS Write/Zone Read, yalnız sunucu IPv4 adresinden kullanım ve otomatik yenileme kapsamlı yeni kalıcı anahtar son inceleme ekranında hazırdır. Tarayıcı güvenlik kuralının istediği açık kullanıcı onayı bekleniyor; anahtar henüz oluşturulmadı. Chrome bağlantısı ayrıca ChatGPT uzantısının güncellenmesini istiyor; bu adım kullanıcıya iletildi. HTTPS ve tarayıcı E2E tamamlanmış olarak sunulmaz.

Kayıt tekrar edilmeyecek; adresler açıldığında mevcut hesapla admin ve storefront doğrulanacak. Pazarlama checkbox'ı kapalıdır. Kişisel posta adresi, parola, kod ve API anahtarları rapora eklenmez.

Bağımsız son proxy incelemesi exact route önceliklerini, dört backend servisinin varlığını/portlarını ve iki storefront middleware'in kendi runtime authority değeriyle bellek içi eşleşmesini doğruladı. Middleware forwarded host/proto'yu değiştirmez. Proxy network namespace'inden Cloudflare'ye zorlanmış IPv6 HTTPS isteğinde gerçek egress adresi `2a01:4f8:1c19:75b5::1` olarak gözlendi; container'ın private IPv6 adresiyle karıştırılmadı. Yalnız IPv4 izinli aday anahtar IPv6 isteklerinde reddedilebilir. Bu nedenle **aynı sunucunun IPv4 ve IPv6 adreslerini kapsayan son IP kısıtı** açık onaya sunuldu; tarayıcı güncellemesinden sonra inceleme ekranına eklenecek. Anahtar henüz oluşturulmadı ve proxy adayları etkinleştirilmedi.

### Ortak host kapısı doğrulaması

[Odaklı kanıt](evidence/automatic-store-onboarding/shared-host-gates-verification.json): admin kapısı/login/handoff29/29, storefront canonical/authority52/52 ve wildcard verifier9/9 test başarılı; iki uygulamanın typecheck/üretim derlemesi başarılı. Admin geliştirme ortamında yalnız exact loopback3400 erişimi korunur. Vitrin genel suite562 başarılı/1 başarısız: değişmeyen CampaignSectionContent testinin react-server koşulunda react-dom/server export uyuşmazlığı; aynı test bu koşul olmadan2/2 başarılıdır. Bu ilgisiz koşul hatası değiştirilmedi. Canlı ortak uygulama yayını ve DNS/TLS/browser kontrolleri aşağıdaki kanıta ayrıca bağlanacak.

### Ortak admin/storefront yayını tamamlandı

İncelenen kaynak **b583d710eac3431e4d2f6f3977218203b27dc85b**, resmi Coolify kuyruğuyla ve hedefler sırayla yayınlandı. Dört dağıtım `finished`, global kuyruk boş; [son configuration guard](evidence/automatic-store-onboarding/shared-apps-deployment-final.json) başarılıdır. İlgisiz ayarlar, preview değerleri ve ödeme izin bayrakları korundu.

| Hedef | Dağıtım | Sonuç |
|---|---|---|
| NET admin | c2i3qmczk1sa22qexp3k8ijd | finished |
| NET mağaza | fhx8ia5nslsl8pa608r0ad9e | finished |
| SITE admin | h12qio4va1oipxbmkqi241pv | finished |
| SITE mağaza | az5rxgbumij7l7y4xq1back1 | finished |

[Çalışan dört image kontrolü](evidence/automatic-store-onboarding/shared-apps-runtime-final.json): image/SOURCE_COMMIT, kaynak hash'leri, derlenmiş proxy ve yollar, üç ödeme candidate digest'i ve derlenmiş yetki değerleri doğrulandı. [Ortak uygulama başlangıç kapsamı](evidence/automatic-store-onboarding/shared-apps-payment-before.json), Owner kapsamından farklıdır: NET Iyzico/PayTR test/live kapalı; SITE Iyzico kapalı, PayTR test ve live zaten açıktı. Aynı bayraklar korundu; mevcut SITE live onayının yalnız kaynak/digest bağı iki normal kayıtta yeni değişmeyen adapter kaynağına taşındı. NET live ve tüm preview değerleri korundu. Ödeme adapter/generator kaynakları eski ortak image commit'iyle aynıdır; sağlayıcı çağrısı veya ödeme işlemi yapılmadı. İlk genel container envanteri tam Docker label çıktısı üretmişti; bu çıktı dosyaya/repoya alınmadı ve son doğrulayıcı yalnız açık güvenli alanları kullanır. Baseline kontrolünün tüm süreç boyunca label üretmediği iddia edilmez.

[NET dahili wire kontrolü](evidence/automatic-store-onboarding/shared-apps-wire-net.json) 9/9 başarılı: Alpler admin root307/login, Alpler/Siora giriş ekranları200 ve doğru marka, configured central login200, bilinmeyen admin root/login404/no-store; Alpler/Siora storefront200/doğru başlık, bilinmeyen storefront404. Probe gerçek `node:http.request` Host başlığıyla çalıştı; Node fetch aynı explicit Host değerini taşımadığı için ilk fetch çıktısı geçerli tenant testi olarak kullanılmadı. Trusted storefront proxy token yalnız container belleğinde okundu, dışarı çıkarılmadı.

[Yayın sonrası mevcut sekiz adres](evidence/automatic-store-onboarding/shared-apps-post-release-health.json) başarılıdır. [Alpler DNS/TLS kontrolü](evidence/automatic-store-onboarding/alpler-spor-before-tls.json): iki adres de sunucuya çözülür, TLS doğrulaması açıkken ikisi de sertifika zinciri doğrulamasında başarısızdır. Wildcard proxy henüz etkinleştirilmedi; gerçek tarayıcı admin/storefront E2E hâlâ bekler. Bu yayın, yeni adreslerin HTTPS erişiminin tamamlandığı anlamına gelmez.
