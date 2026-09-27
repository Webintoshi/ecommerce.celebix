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

Son bağımsız SQL/UI/prompt incelemesi, kaynak commit/push, iki Owner resmi Coolify yayını ve canlı SQL166 uygulanması kök ajan kapsamındadır; sonuç kanıtları geldikçe bu bölüm güncellenecektir.
