# Toshi Çoklu Yapay Zekâ Sağlayıcısı ve BYOK Tasarımı

**Durum:** Kullanıcı tarafından bölüm bölüm onaylandı  
**Tarih:** 2026-08-02  
**Hedef uygulama:** `apps/customer-panel`  
**Ayar yüzeyi:** `/settings/artificial-intelligence`  
**Bağlı ana tasarım:** `2026-07-24-toshi-store-management-assistant-design.md`

## 1. Amaç

Her mağaza OpenAI, Google Gemini ve Anthropic Claude bağlantılarını kendi API
anahtarlarıyla kurabilir. Başarıyla doğrulanıp kaydedilen her bağlantı o mağaza için
hemen aktif olur. Bağlı sağlayıcılardan biri Toshi'nin varsayılan sağlayıcısı seçilir;
Toshi doğal dil, analiz ve güvenli mağaza yönetimi yeteneklerini bu sağlayıcı üzerinden
kullanır.

Bu çalışma yeni bir yönetim otoritesi oluşturmaz. Yapay zekâ sağlayıcısı yalnızca
yorumlama ve planlama katmanıdır. Mağaza verisini okuma veya değiştirme yetkisi mevcut
Celebix oturumu, tenant, rol, plan ve araç sözleşmelerinden gelir.

## 2. Kapsam ve Sınırlar

Kapsam:

- OpenAI, Gemini ve Claude için birbirinden bağımsız resmî API adaptörleri;
- mağazaya ait API anahtarını doğrulama, şifreli kaydetme, değiştirme ve kaldırma;
- sağlayıcı tarafından sunulan izinli modelleri listeleme ve model seçme;
- birden çok bağlı sağlayıcı arasından Toshi varsayılanını seçme;
- konuşmayı başladığı sağlayıcı ve modele sabitleme;
- salt okunur mağaza araçları ve ayrıca onaylanan yazma işlemleri;
- mağaza izolasyonu, güvenli audit ve anlaşılır hata durumları.

Kapsam dışı:

- Celebix'e ait ortak bir sağlayıcı anahtarıyla mağazaları çalıştırmak;
- kullanıcı tarafından özel base URL, proxy veya OpenAI-uyumlu üçüncü taraf sunucu
  kabul etmek;
- sağlayıcılar arasında gizli ya da otomatik fallback yapmak;
- modelin doğrudan PostgreSQL'e, repository'lere veya yönetim API'lerine erişmesi;
- API anahtarını tarayıcıya veya tekrar okunabilir bir ayar cevabına döndürmek.

## 3. Kullanıcı Deneyimi

`/settings/artificial-intelligence` ekranında üç sağlayıcı birlikte görünür:

- OpenAI;
- Google Gemini;
- Anthropic Claude.

Her sağlayıcı kartında şunlar bulunur:

- API anahtarı girişi;
- `Bağlan` veya bağlıysa `Anahtarı değiştir` işlemi;
- canlı bağlantı durumu;
- izinli model seçimi;
- `Toshi için varsayılan yap` işlemi;
- maskeli anahtar bilgisi;
- son başarılı doğrulama zamanı;
- bağlantıyı kaldırma işlemi.

### 3.1 Kaydetme ve etkinleştirme

`Bağlan` işlemi iki aşamayı tek sunucu akışında yürütür:

1. Girilen anahtar ilgili sağlayıcının resmî API'sinde doğrulanır ve modeller alınır.
2. Doğrulama başarılıysa anahtar şifrelenerek kaydedilir ve bağlantı `active` olur.

Geçersiz anahtar hiçbir zaman kalıcılaştırılmaz. Mevcut çalışan anahtar değiştirilirken
yeni anahtar doğrulanamazsa eski aktif bağlantı korunur.

Mağazanın henüz varsayılan sağlayıcısı yoksa ilk başarılı bağlantı otomatik varsayılan
olur. Daha sonra bağlanan sağlayıcılar aktif ve kullanılabilir olur fakat mevcut
varsayılanı sessizce değiştirmez. Kullanıcı varsayılanı açık bir işlemle değiştirir.

Bağlantının aktif olması ile varsayılan olması farklı durumlardır:

- `active`: anahtar doğrulandı ve sağlayıcı kullanılabilir;
- `default`: yeni Toshi konuşmalarında ilk seçilecek aktif sağlayıcı.

### 3.2 Konuşma sabitleme

Yeni konuşma mevcut varsayılan sağlayıcı ve seçili model ile açılır. Konuşma kaydı
`providerConfigId` ve model sürümünü saklar. Varsayılan sağlayıcı daha sonra değişse
bile devam eden konuşma kendiliğinden başka sağlayıcıya taşınmaz. Böylece bağlam,
maliyet ve veri paylaşımı öngörülebilir kalır.

Bağlantı kaldırılmışsa o sağlayıcıya sabit eski konuşma salt okunur geçmiş olarak
görüntülenebilir; yeni model çağrısı için kullanıcı aktif bir sağlayıcıyla yeni konuşma
başlatır.

## 4. Resmî Sağlayıcı Adaptörleri

Her adaptör yalnız sabit resmî host ve endpoint allowlist'i kullanır. Anahtarlar yalnız
sunucu tarafında header'a eklenir. Yönlendirmeler takip edilmez; DNS/URL değeri kullanıcı
girdisinden türetilmez.

### 4.1 OpenAI

- Host: `https://api.openai.com`
- Kimlik doğrulama: `Authorization: Bearer <key>`
- Doğrulama/model listesi: `GET /v1/models`
- Toshi yanıtı: `POST /v1/responses`
- Varsayılan veri davranışı: sağlayıcı tarafı konuşma durumu gerekmiyorsa `store: false`

Yalnız Celebix'in izin listesine aldığı ve gerekli structured output/tool calling
yeteneklerini taşıyan modeller seçilebilir.

### 4.2 Google Gemini

- Host: `https://generativelanguage.googleapis.com`
- Kimlik doğrulama: `x-goog-api-key: <key>`
- Doğrulama/model listesi: `GET /v1beta/models`
- Toshi yanıtı: `POST /v1beta/models/{allowlistedModel}:generateContent`

Model adı URL'ye doğrudan kullanıcı girdisi olarak yazılmaz; doğrulanmış model listesinden
ve Celebix izin listesinden çözülür. Google'ın güncel anahtar kısıtlarıyla uyumsuz veya
yetkisiz anahtarlar bağlantı sırasında reddedilir.

### 4.3 Anthropic Claude

- Host: `https://api.anthropic.com`
- Kimlik doğrulama: `x-api-key: <key>`
- Zorunlu sürüm başlığı: `anthropic-version: 2023-06-01`
- Doğrulama/model listesi: `GET /v1/models`
- Toshi yanıtı: `POST /v1/messages`

Yalnız doğrulanan ve Celebix izin listesine alınan Claude modelleri seçilebilir.

### 4.4 Ortak adaptör sözleşmesi

```ts
interface ToshiProviderAdapter {
  readonly provider: "openai" | "gemini" | "anthropic";
  verifyCredential(secret: SecretBytes): Promise<VerifiedProviderAccount>;
  listAllowedModels(secret: SecretBytes): Promise<AllowedProviderModel[]>;
  generateTurn(input: ProviderTurnInput): Promise<ProviderTurnResult>;
}
```

Her adaptör şunları uygular:

- bağlanma ve toplam istek timeout'u;
- cevap boyutu, tool çağrısı ve tur sayısı sınırı;
- şema doğrulaması ve bilinmeyen alanların reddi;
- 401/403, 429, kota, timeout ve 5xx hata sınıflandırması;
- raw provider cevabının güvenli uygulama hatasına projeksiyonu;
- prompt, cookie, token ve API anahtarını loglamama;
- yazma aracını otomatik tekrar etmeme.

## 5. Kalıcılık ve Secret Güvenliği

Ana tasarımdaki `toshi_provider_configs` çoklu sağlayıcıyı destekleyecek biçimde
kesinleştirilir:

- `id`, `store_id`, `provider`;
- `encrypted_secret`, `secret_key_id`, `secret_digest`, `masked_suffix`;
- `status`: `active | invalid | revoked`;
- `selected_model`, `verified_at`, `verification_error_code`;
- `is_default`;
- `created_at`, `updated_at`, `revoked_at`.

Kurallar:

- mağaza ve sağlayıcı başına en fazla bir güncel yapılandırma;
- mağaza başına en fazla bir `active + is_default` yapılandırma;
- varsayılan değişimi tek transaction içinde yapılır;
- model yalnız son doğrulanan model kümesinden seçilir;
- silme fiziksel secret erişimini derhal keser ve revoke audit olayı üretir;
- maskeli son ek dışında secret hiçbir read DTO'sunda yer almaz.

API anahtarları mevcut sunucu keyring'iyle AEAD envelope encryption kullanılarak
saklanır. Şifreleme bağlamı en az `storeId`, provider config ID, provider türü ve key
ID içerir. Secret yalnız provider çağrısının yapıldığı kısa sunucu kapsamı içinde
çözülür; istemci component, browser storage, analytics veya hata cevabına girmez.

Tablo erişimi mağaza sınırı ve FORCE RLS ile korunur. Uygulama yalnız kontrollü
SECURITY DEFINER fonksiyonları/repository sınırı üzerinden okur ve yazar.

## 6. HTTP Yüzeyi

Same-origin yönetim uçları:

- `GET /api/settings/artificial-intelligence/providers`
- `POST /api/settings/artificial-intelligence/providers/:provider/connect`
- `PATCH /api/settings/artificial-intelligence/providers/:provider/model`
- `POST /api/settings/artificial-intelligence/providers/:provider/default`
- `DELETE /api/settings/artificial-intelligence/providers/:provider`

`connect` ham secret kabul eden tek uçtur. Cevap yalnız provider, durum, maskeli son ek,
izinli modeller, seçili model ve doğrulama zamanını döndürür. Secret echo edilmez.

Mutasyonlar mevcut panel güvenlik sözleşmelerine ek olarak exact origin, exact path,
JSON content type, body sınırı, şema doğrulaması ve idempotency key ister. Provider route
parametresi yalnız sabit enum olabilir.

## 7. Toshi Çalışma Akışı

1. Yönetici Toshi'ye mesaj gönderir.
2. Sunucu konuşmanın sabit provider config'ini veya yeni konuşma için varsayılanı çözer.
3. Oturum, mağaza üyeliği, rol ve sağlayıcı durumu yeniden doğrulanır.
4. Mesaj, minimum gerekli mağaza bağlamı ve izinli araç şemaları sağlayıcıya gönderilir.
5. Model bir araç çağrısı önerirse sunucu girdiyi araç şemasıyla doğrular.
6. Salt okunur araç mevcut repository/facade üzerinden çalışır.
7. Yazma aracı immutable önizleme ve kısa ömürlü tek kullanımlık onay üretir.
8. Yönetici onaylarsa yetkiler ve kaynak sürümü tekrar doğrulanır, sonra işlem çalışır.
9. Sonuç mağaza bazlı konuşma ve audit kayıtlarına yazılır.

Model hiçbir aşamada SQL, tablo adı, credential veya serbest HTTP istemcisi alamaz.
Provider cevabı bir komut değil, yalnız doğrulanması gereken öneridir.

## 8. Veri Minimizasyonu ve Gizlilik

- Her araca yalnız görevi için gereken alanlar verilir.
- Sipariş/müşteri aramalarında gereksiz kişisel veri modele gönderilmez.
- Secret, session cookie, internal token ve altyapı bilgileri prompt'a eklenmez.
- Konuşma geçmişi Celebix PostgreSQL'de tutulur; provider-side conversation ID otorite
  veya birincil kalıcılık olarak kullanılmaz.
- Sağlayıcı değiştirmek eski konuşma bağlamını otomatik olarak yeni sağlayıcıya göndermez.
- Otomatik fallback yapılmaz; hata sonrası sağlayıcı değişimi yöneticinin açık işlemidir.

## 9. Hata Davranışı

Kullanıcıya sağlayıcıya göre anlaşılır fakat secret içermeyen durum gösterilir:

- `credential_invalid` — anahtar geçersiz veya yetkisiz;
- `model_unavailable` — model kaldırılmış veya hesapta kullanılamıyor;
- `rate_limited` — geçici istek sınırı;
- `quota_exceeded` — sağlayıcı hesabı kotası/faturalaması;
- `provider_timeout` — sağlayıcı zaman aşımı;
- `provider_unavailable` — geçici sağlayıcı arızası;
- `connection_revoked` — bağlantı kaldırılmış;
- `approval_required` — işlem yönetici onayı bekliyor.

Bir sağlayıcı başarısız olduğunda başka bağlı sağlayıcı gizlice kullanılmaz. Salt okunur
yerel Toshi komutları mümkünse çalışmaya devam eder.

## 10. Test ve Kabul Ölçütleri

### 10.1 Adaptör testleri

- Üç sağlayıcı için header, endpoint, timeout ve cevap şeması contract testleri;
- başarılı bağlantı/model listesi ve her hata sınıfı;
- redirect, bilinmeyen host/model ve aşırı cevap reddi;
- provider cevabındaki bozuk tool çağrısının çalıştırılmaması.

### 10.2 Güvenlik testleri

- A mağazasının B mağazasının provider durumunu, anahtarını veya konuşmasını görememesi;
- secret'ın API cevabı, HTML, client prop, browser storage ve loglarda bulunmaması;
- yanlış origin, içerik türü, provider ve body şemasının reddi;
- kaldırılan/değiştirilen anahtarın yeniden kullanılamaması;
- modelin onaysız yazma işlemi çalıştıramaması;
- approval replay, expiry, payload ve mağaza bağlama kontrolleri.

### 10.3 Kullanıcı akışı testleri

- OpenAI anahtarını bağlama, otomatik aktifleşme ve ilk varsayılan seçimi;
- Gemini ve Claude'u ayrıca bağlama, her birinin aktif kalması;
- varsayılan değiştirme ve yalnız yeni konuşmalara uygulanması;
- model seçme ve yeni konuşmada seçili modelin kullanılması;
- geçersiz yeni anahtarda mevcut çalışan bağlantının korunması;
- bağlantı kaldırma ve geçmiş konuşmanın salt okunur kalması;
- rate limit, kota ve kesinti mesajlarının doğru görünmesi.

Kabul için üç sağlayıcının her biri kendi resmî API'siyle bağlanmalı, anahtar kaydedilince
aktif olmalı, Toshi gerçek mağaza verisini yalnız izinli araçlarla kullanmalı ve mağaza
izolasyonu/gizli anahtar kuralları bütün testlerde korunmalıdır.

## 11. Uygulama Sırası

1. Kalıcılık, RLS, secret envelope ve provider repository;
2. üç provider adaptörü ve doğrulama/model uçları;
3. AI ayar ekranındaki provider kartları;
4. Toshi conversation provider sabitleme ve model çağrısı;
5. mevcut salt okunur araç registry'sinin provider tool calling'e bağlanması;
6. onaylı yazma araçları ve audit;
7. güvenlik, contract ve uçtan uca testler;
8. özellik bayrağıyla staging doğrulaması ve kontrollü üretim açılışı.

## 12. Resmî Referanslar

- OpenAI API quickstart ve Responses API: <https://platform.openai.com/docs/quickstart/make-your-first-api-request>
- OpenAI Models API: <https://platform.openai.com/docs/api-reference/models/object?lang=curl>
- OpenAI veri kontrolleri: <https://platform.openai.com/docs/models/default-usage-policies-by-endpoint>
- Google Gemini API: <https://ai.google.dev/api>
- Gemini generateContent: <https://ai.google.dev/api/generate-content?hl=en>
- Gemini API anahtarı: <https://ai.google.dev/gemini-api/docs/generate-content/api-key?authuser=2>
- Anthropic kimlik doğrulama: <https://platform.claude.com/docs/en/manage-claude/authentication>
- Anthropic Models API: <https://platform.claude.com/docs/en/api/models/list>
- Anthropic Messages API: <https://platform.claude.com/docs/en/api/messages/create>
- Anthropic API versioning: <https://platform.claude.com/docs/en/api/versioning>
