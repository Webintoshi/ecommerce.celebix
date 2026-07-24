# Toshi Mağaza Yönetim Asistanı Tasarımı

**Durum:** Kullanıcı tarafından yazılı olarak onaylandı  
**Tarih:** 2026-07-24  
**Hedef uygulama:** `apps/customer-panel`  
**Referans görsel:** `/Users/Celebix/Desktop/toshi-profile.webp`

## 1. Amaç

Toshi, müşteri panelinin üzerinde çalışan süs amaçlı bir sohbet kutusu değil, mağazanın
mevcut ve kalıcı yönetim yetkilerini kullanan gerçek bir yönetim asistanı olacaktır.
API anahtarı olmadan sınırlı fakat faydalı deterministik komutları yerine getirecek;
onaylı bir yapay zekâ sağlayıcısı bağlandığında doğal dil, analiz, içerik üretimi ve
çok adımlı planlama yetenekleri açılacaktır.

Toshi yeni bir mağaza otoritesi oluşturmayacaktır. Her okuma ve yazma işlemi mevcut
sunucu oturumu, `TenantContext`, üyelik rolü, plan özellikleri ve ilgili repository
kurallarıyla yeniden yetkilendirilecektir.

## 2. Mevcut Sistem ve Korunacak Sınırlar

Mevcut müşteri panelinde gerçek ve same-origin yönetim yüzeyleri bulunmaktadır:

- katalog, ürün, varyant, medya ve katalog özeti;
- sipariş listesi, sipariş özeti, durum, ödeme, kargo ve not işlemleri;
- müşteri listesi, özet, not, etiket ve segment işlemleri;
- terk edilmiş sepetler ve hızlı sipariş bağlantıları;
- kampanya, içerik, SEO, ayar ve sağlayıcı hazırlık kayıtları;
- analiz, envanter ve fiyatlandırma yüzeyleri;
- kalıcı panel oturumu ve sunucu kaynaklı `TenantContext`.

`apps/admin` yalnız donor kaynaktır ve değiştirilmez. Legacy Supabase/Logto admin
otoriteleri, `/api/admin/**`, browser store/tenant kimliği, iframe, reverse proxy ve
ikinci bir admin uygulaması Toshi'ye taşınmaz.

Mevcut `/settings/artificial-intelligence` yüzeyi yalnız dil, ton ve özellik
tercihlerini saklamaktadır. API anahtarı saklamak için yeterli değildir ve düz metin
secret alanına dönüştürülmeyecektir.

## 3. Çalışma Modları

### 3.1 Yerel mod

Yerel mod harici yapay zekâ çağrısı yapmaz. Sonlu ve test edilebilir bir intent
çözümleyici kullanır. Şunları destekler:

- mağaza, sipariş, katalog, müşteri ve terk edilmiş sepet özetlerini göstermek;
- sipariş numarası, müşteri adı/e-postası, ürün adı/SKU ile arama yapmak;
- düşük stok, taslak ürün, bekleyen sipariş ve terk edilmiş sepetleri listelemek;
- desteklenen panel sayfalarına güvenli bağlantılar üretmek;
- yazma komutlarını tanıyıp mevcut yetkiye göre işlem önizlemesi hazırlamak;
- işlem sonucu, reddedilme nedeni ve güvenli yeniden deneme bilgisini göstermek.

Yerel mod serbest metin üretmez ve bilinmeyen komutları tahmin etmez. Tanınmayan
isteklerde desteklenen komutları gösterir.

### 3.2 Yapay zekâ modu

Yapay zekâ modu yalnız aktif, doğrulanmış ve sunucu tarafında çözülen sağlayıcı
yapılandırması varsa açılır. Yerel moda ek olarak:

- doğal dilde mağaza sorularını anlar;
- birden fazla güvenli okuma aracını bir plan içinde kullanır;
- satış, ürün, müşteri ve stok verilerini özetler;
- ürün açıklaması, SEO, blog ve kampanya taslağı üretir;
- önerilen değişiklikleri yapılandırılmış işlem taslaklarına dönüştürür;
- kullanıcının açık onayından sonra izin verilen Toshi araçlarını çağırır.

Modelin araç çağırabilmesi yeni yetki kazandığı anlamına gelmez. Araç katmanı her
çağrıda oturum, tenant, rol, plan ve kaynak sürümünü yeniden doğrular.

## 4. Yetenek ve Risk Sınıfları

### 4.1 Salt okunur

Doğrudan çalışabilir:

- özet ve liste okumaları;
- ürün, müşteri ve sipariş aramaları;
- durum, stok ve analiz açıklamaları;
- panel rotalarına güvenli yönlendirme;
- içerik ve SEO için mevcut kayıtların okunması.

### 4.2 Onay gerektiren yazmalar

Her işlem önce kullanıcıya tam bir önizleme gösterir. Onay tek kullanımlık, kısa
ömürlü ve mağaza/üye/işlem payload'ına bağlıdır:

- ürün oluşturma veya güncelleme;
- varyant, fiyat, stok veya yayın durumu değiştirme;
- sipariş durumu, kargo ve not işlemleri;
- müşteri notu, etiketi ve segment değişikliği;
- indirim, içerik, SEO ve mağaza ayarı taslağı kaydetme;
- güvenli merchant-admin kayıtlarını kaydetme veya arşivleme.

### 4.3 Yüksek riskli ve sınırlı

Aşağıdaki işlemler her zaman açık, ayrı onay ister; ilk sürümde uygun mevcut API
yoksa Toshi bunları çalıştırmaz:

- ödeme/iade;
- yönetici rolü veya üyelik değişikliği;
- credential, API anahtarı veya sağlayıcı bağlantısı değişikliği;
- kalıcı silme;
- toplu müşteri iletişimi veya harici yayın;
- üretim/deploy, migration veya altyapı işlemi.

Toshi'nin “mağazayı yönetmesi”, mevcut yetkili iş akışlarını güvenli biçimde
orkestre etmesi anlamına gelir; otorite sınırlarını aşması anlamına gelmez.

## 5. Mimari

### 5.1 İstemci kabuğu

Müşteri panelinde:

- sağ üstte kullanıcının verdiği Toshi profil görselini kullanan launcher;
- masaüstünde erişilebilir sağ drawer;
- mobilde tam ekran asistan yüzeyi;
- gerçek `/toshi` çalışma alanı;
- `/toshi/history` konuşma geçmişi;
- `/toshi/actions` bekleyen ve tamamlanan işlem kayıtları;
- sayfa bağlamına göre güvenli hızlı komutlar;
- streaming olmayan yerel yanıt ve sağlayıcı destekliyorsa kontrollü streaming yanıt;
- işlem önizleme, onay, iptal, sonuç ve hata durumları bulunur.

Tam `TenantContext`, server secret, cookie veya provider credential hiçbir client
component prop'una girmez.

### 5.2 HTTP sınırı

Önerilen same-origin uçlar:

- `GET /api/toshi/capabilities`
- `POST /api/toshi/messages`
- `GET /api/toshi/conversations`
- `GET /api/toshi/conversations/:id`
- `POST /api/toshi/actions/:id/confirm`
- `POST /api/toshi/actions/:id/cancel`
- `GET /api/toshi/actions`
- `GET /api/toshi/provider`
- `PUT /api/toshi/provider`
- `POST /api/toshi/provider/verify`
- `DELETE /api/toshi/provider`

Mutasyonlar exact `Origin`, exact path, JSON content type, bounded body ve
idempotency key ister. Private header, browser store/tenant alanı, forwarded
authority ve bilinmeyen JSON alanları reddedilir.

### 5.3 Toshi tool registry

Her araç değişmez bir sözleşmedir:

```ts
interface ToshiToolDefinition<Input, Preview, Result> {
  readonly name: ToshiToolName;
  readonly risk: "read" | "confirm" | "restricted";
  readonly requiredAction: MerchantAction;
  readonly parseInput: (value: unknown) => Input;
  readonly preview: (context: ServerToshiContext, input: Input) => Promise<Preview>;
  readonly execute?: (
    context: ServerToshiContext,
    approved: ApprovedToshiAction<Input>,
  ) => Promise<Result>;
}
```

Araçlar mevcut repository/facade yüzeylerini kullanır. Tarayıcı DTO istemcileri
server otoritesi yerine kullanılmaz; yeni SQL otoritesi yalnız mevcut yüzeyin
karşılamadığı kalıcı Toshi kayıtları için eklenir.

### 5.4 Yerel intent motoru

Yerel motor sonlu intent ve slotlardan oluşur. Örnekler:

- `show_store_summary`
- `list_pending_orders`
- `find_order`
- `find_customer`
- `find_product`
- `list_low_stock`
- `navigate`
- `prepare_product_status`
- `prepare_order_status`
- `prepare_customer_note`

Normalize edilen komutlar uzunluk, kontrol karakteri ve locale sınırlarına tabidir.
Belirsiz veya çakışan eşleşme yazma işlemi üretmez.

### 5.5 Sağlayıcı adaptörü

İlk adaptör kayıtlı bir OpenAI-uyumlu sunucu sağlayıcısı olacaktır. İlk sürümde
kullanıcı tarafından keyfi base URL kabul edilmez; bu SSRF ve veri sızıntısı riskini
önler. Sağlayıcı adaptörü:

- sabit allowlist endpoint;
- model allowlist;
- timeout ve cevap boyutu sınırı;
- yapılandırılmış JSON/tool-call doğrulaması;
- tool ve tur sayısı sınırı;
- güvenli hata projeksiyonu;
- token/secret/prompt loglamama;
- minimum veri paylaşımı kurallarını uygular.

Provider başarısızsa yazma işlemi otomatik tekrarlanmaz. Kullanıcı güvenli bir hata
ve yerel mod seçeneklerini görür.

## 6. Secret ve Kalıcılık

API anahtarı `merchant_admin_records.config` içine konmaz. Yeni Toshi kalıcılığı:

- `toshi_provider_configs`: provider, model, key ID, şifreli secret zarfı, durum;
- `toshi_conversations`: mağaza, principal, başlık ve yaşam döngüsü;
- `toshi_messages`: rol, güvenli içerik, tool özeti ve zaman;
- `toshi_action_intents`: immutable payload digest, risk, durum ve expiry;
- `toshi_action_events`: append-only audit olayları.

Tablolar RLS + FORCE RLS ile korunur; PUBLIC ve uygulama rollerine tablo ayrıcalığı
verilmez. İşlemler yalnız SECURITY DEFINER fonksiyonları üzerinden gerçekleşir.

Secret zarfı sunucu keyring'iyle AEAD şifrelenir ve şu bağlama kilitlenir:

- store ID;
- provider config ID;
- provider türü;
- key ID;
- secret digest.

API anahtarı yazıldıktan sonra geri okunamaz. Yalnız maskeli durum, provider, model,
oluşturulma/güncellenme zamanı ve son doğrulama sonucu projekte edilir. Rotasyon ve
revocation audit kaydı üretir. Raw key, model prompt'u, cookie veya token loglanmaz.

## 7. Sağlayıcı Ayarları ve Alt Sayfalar

`/settings/artificial-intelligence` gerçek bir hub olacaktır:

- **Genel:** dil, ton, açık özellikler ve yerel mod durumu;
- **Sağlayıcı:** API anahtarı ekleme/değiştirme, maskeli durum, model seçimi,
  doğrulama ve kaldırma;
- **Yetkiler:** Toshi'nin hangi araçları önerebileceği ve hangi işlemlerde mutlaka
  onay isteyeceği;
- **Gizlilik:** modele gönderilebilecek veri sınıfları ve saklama tercihleri;
- **Geçmiş:** konuşma ve işlem audit bağlantıları.

Navigasyon yalnız ilgili gerçek sayfa, API ve kalıcılık birlikte tamamlandığında
gösterilir.

## 8. Toshi Arayüz Davranışı

Profil resmi hedefte `apps/customer-panel/public/toshi/toshi-profile.webp` olarak
saklanır. Görsel dekoratif değil, asistan kimliği olarak anlamlı `alt` metniyle
kullanılır.

Drawer:

- açıldığında başlığa odak verir;
- Escape, backdrop ve kapatma butonuyla kapanır;
- kapanınca launcher'a odak döner;
- konuşma bölgesi `aria-live="polite"` kullanır;
- form gönderimi sırasında tek aktif istek sınırı uygular;
- ağ/sağlayıcı hatalarında önceki güvenli konuşmayı korur;
- mobil dock ve form alanlarını kapatmaz;
- reduced-motion tercihine uyar.

Toshi yanıtları doğrulanmış veri ile öneriyi görsel olarak ayırır. Her sonuç hangi
gerçek kaynaktan geldiğini genel seviyede belirtir; private kimlik veya SQL ayrıntısı
göstermez.

## 9. İşlem Yaşam Döngüsü

1. Kullanıcı komut gönderir.
2. Sunucu aktif panel oturumu ve `TenantContext` çözer.
3. Yerel motor veya provider yapılandırılmış intent üretir.
4. Tool registry yetki ve input doğrulaması yapar.
5. Salt okunur araç doğrudan çalışır.
6. Yazma aracı immutable preview ve expiry'li action intent oluşturur.
7. Kullanıcı exact preview'ı onaylar.
8. Sunucu action intent, digest, üyelik, mağaza, kaynak sürümü ve yetkiyi yeniden
   doğrular.
9. Mevcut idempotent repository mutasyonu bir kez çalışır.
10. Sonuç veya kontrollü belirsizlik audit edilir ve kullanıcıya güvenli şekilde
    gösterilir.

Replay, farklı principal/store, değiştirilmiş payload, süresi dolmuş intent ve
önceden terminal olmuş intent reddedilir. `commit_unknown` otomatik ikinci yazma
üretmez; mevcut repository recovery sözleşmesi varsa yalnız o kullanılır.

## 10. Veri Minimizasyonu

- Modele varsayılan olarak müşteri adı/e-posta listesi topluca gönderilmez.
- Bir müşteri/sipariş sorusunda yalnız eşleşen ve gereken DTO alanları paylaşılır.
- Adres, telefon ve not alanları amaç yoksa redakte edilir.
- Provider prompt'una raw database ID yerine gereken güvenli referanslar eklenir.
- Toshi konuşmaları secret, cookie, auth header ve raw provider cevaplarını kabul
  etmeden önce filtrelenir.
- Export, bulk iletişim ve harici yayın ayrı araç ve ayrı onay ister.

## 11. Uygulama Dalgaları

### Dalga A — Kabuk ve API'siz okuma

Profil görseli, launcher/drawer, `/toshi`, capabilities, yerel intent motoru,
mağaza/sipariş/ürün/müşteri özetleri ve aramalar.

### Dalga B — Güvenli işlem motoru

Action intent tabloları, preview/confirm/cancel, idempotency, audit ve ilk ürün,
sipariş, müşteri yazma araçları.

### Dalga C — Provider kasası

Şifreli provider yapılandırması, ayar alt sayfaları, doğrulama, rotasyon, revoke ve
server-only adaptör.

### Dalga D — Gelişmiş AI

Doğal dil tool orchestration, analiz, ürün/SEO/içerik/kampanya taslakları ve
minimum-veri prompt projeksiyonu.

### Dalga E — Tam panel entegrasyonu

Desteklenen tüm gerçek sayfalarda bağlamsal komutlar, geçmiş/audit, mobil/desktop
kabul, PostgreSQL concurrency/replay ve tam regresyon.

Her dalga ayrı test-first görevler ve küçük commit sınırlarıyla uygulanır. Bir dalga
tamamlanmadan sonraki dalganın navigasyonu veya sahte ekranı gösterilmez.

## 12. Test Stratejisi

- contract parser ve exact-shape negatif testleri;
- yerel intent belirsizlik ve unknown-command testleri;
- tool registry rol/plan/tenant negatif testleri;
- HTTP method/path/origin/body/private-header testleri;
- API key encryption, rotation, revoke ve no-readback testleri;
- PostgreSQL RLS, concurrency, replay, expiry, backup/restore ve cleanup;
- provider timeout, malformed JSON, unknown tool ve oversized response testleri;
- yazma preview/confirmation/version-conflict/commit-unknown testleri;
- raw secret, PII, cookie, token, ID ve prompt log taramaları;
- drawer focus, Escape, backdrop, mobile, reduced-motion ve 48px target testleri;
- gerçek API fixture'larıyla dashboard/order/product/customer akışları;
- customer-panel ve Owner tam test/typecheck/build regresyonları;
- desktop 1440×900, boundary 1025×768, mobile 390×844 ve 320×720 browser kabulü.

## 13. Kabul Kriterleri

Toshi tamamlanmış sayılmaz, ta ki:

- API anahtarı olmadan desteklenen özet, arama ve navigasyon komutları çalışana;
- onay gerektiren bir gerçek mutasyon preview → confirm → durable result zincirini
  tamamlayana;
- API key ekleme, doğrulama, kullanma, rotasyon ve revoke güvenli biçimde çalışana;
- provider destekli tool çağrısı gerçek ama minimum mağaza verisiyle çalışana;
- yanlış tenant, rol, origin, path, intent, replay ve secret sızıntısı testleri
  fail-closed kalana;
- bütün yeni alt sayfalar gerçek API ve kalıcılığa bağlı olana;
- mevcut panel, katalog, sipariş, müşteri ve oturum davranışı gerilemeyene;
- browser görsel ve erişilebilirlik kabulü tamamlanana kadar.

## 14. Bu Tasarımın Dışında

- production deploy veya credential mutasyonu;
- kullanıcı onayı olmadan yüksek riskli otonom yazma;
- modelin doğrudan PostgreSQL veya provider secret erişimi;
- keyfi provider base URL;
- gerçek müşteri verisiyle test;
- `apps/admin` değişikliği;
- mevcut oturum ve `TenantContext` otoritesini değiştirmek.

