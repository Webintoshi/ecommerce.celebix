# Otomatik mağaza kaydı — gerçek hesap çalışması

## Kapsam

İstenen Alpler Spor hesabını normal `/kayit` ve Logto akışıyla oluşturma, gözlenen başlangıç sorunlarını düzeltme, ortak NET/SITE kayıt panellerini yayınlama. İlk mağaza için mevcut HTTPS wildcard altyapısı kullanılır; ayrı Coolify uygulaması açılmaz. Pazarlama onayı, gerçek sipariş/ödeme veya ücretli plan işlemi yok.

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

Salt okunur kontrolde istenen e-posta için principal/active owner membership ve istenen slug için mağaza bulunmadı. Kullanıcı gerekli kayıt metinlerini açıkça kabul etti; yalnız gerekli checkbox seçilip normal kayıt gönderildi. Logto e-postayı kullanıcı adı olarak reddetti. Aşağıdaki kimlik yapılandırması düzeltildikten sonra yeni normal kayıt denemesi gerçek e-posta doğrulama ekranına ulaştı. Kullanıcı şu anda posta kutusuna erişemediğini belirtti. **Hesap/tenant henüz oluşturulmadı.** Şifre, kod ve kimlik tokenları dosya veya raporlara yazılmaz.

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

### Bekleyen gerçek hesap adımı

Gerekli metin kabulü alınmıştır. Kullanıcı ilk posta kutusuna erişemediği için kayıt adresini kendi belirttiği Gmail adresine değiştirmeyi istedi; normal ekranda geri dönülüp bu adrese yeni kod gönderildi ve altı haneli kod ekranı doğrulandı. İki adres için de Logto kullanıcı sayısı0. **Alpler Spor hesabı henüz oluşturulmadı; kullanıcıdan gerçek e-posta doğrulama kodu bekleniyor.** Chrome kayıt tabı korunur. Gerekirse normal ekrandan yeni kod gönderilip kullanıcıdan alınacak; ardından verilen şifreyle ilk hesap kurulumu, admin oturumu ve yeni storefront E2E tamamlanacak. Pazarlama checkbox’ı kapalıdır. Kişisel posta adresi ve şifre rapora eklenmez.
