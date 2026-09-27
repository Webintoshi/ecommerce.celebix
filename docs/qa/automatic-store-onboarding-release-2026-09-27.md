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

Salt okunur kontrolde istenen e-posta için principal/active owner membership ve istenen slug için mağaza bulunmadı. Gerçek kayıt sayfasında mağaza adı ve slug girildi. Gerekli gizlilik/metin kabulü için kullanıcı yanıtı bekleniyor; checkbox seçilmedi, kayıt gönderilmedi. Bu aşamada **hesap/tenant oluşturulduğu iddia edilmez**. Şifre, kod ve kimlik tokenları dosya veya raporlara yazılmaz.

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

### Bekleyen gerçek hesap adımı

Gerekli KVKK/gizlilik/metin kabulü için kullanıcının açık yanıtı hâlâ bekleniyor. Chrome gerçek kayıt tabı sonraki tur için korunur. **Alpler Spor hesabı henüz oluşturulmadı; e-posta doğrulaması, admin oturumu ve yeni mağaza storefrontE2E kontrolü tamamlanmış sayılmaz.** Devam için aynı normal signup tabı kullanılacak; sözleşme/email doğrulaması atlanmayacak.
