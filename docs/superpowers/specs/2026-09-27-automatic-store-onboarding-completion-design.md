# Otomatik mağaza açılışını tamamlama tasarımı

Tarih: 27 Eylül 2026. Dayanak: kullanıcının gerçek Alpler Spor kaydı ve ardından istediği altı maddelik güvenilirlik çalışması/tamamlama planı.

## Amaç ve mevcut durum

Kullanıcı kayıt ve e-posta doğrulamasından sonra doğru işletmenin admin paneline ve mağazasına ulaşabilmeli. Kesinti veya belirsiz işlem sonucu, aynı kayıt işleminin başka bir mağaza oluşturmasına yol açmamalı. Kullanıcı mevcut işlemin durumunu ve sonraki adımı görebilmeli.

Kaynak incelemesi `ea79272b` üzerinde yapıldı. Canlı Owner kaynağı `7d1230e1`, ortak admin/storefront kaynağı `b583d710`. Alpler Spor normal Logto kaydıyla oluştu; sahiplik, ücretsiz abonelik, canonical alan adları, yayınlanabilir schema4 başlangıç tasarımı ve medya namespace'i doğrulandı. NET/SITE ortak uygulama düzeltmeleri yayımlandı. NET mağaza/admin ve eksik SITE admin wildcard DNS kayıtları hazırdır. Wildcard HTTPS/router adayları henüz etkinleştirilmedi; yeni adreslerin TLS doğrulaması başarısızdır.

Canlı kanıt: [kayıt/yayın raporu](../../qa/automatic-store-onboarding-release-2026-09-27.md). Önceki gerçek kayıt planının tamamlanan işleri tekrar uygulanmaz.

## Mimari ve kapsam

Mevcut `apps/owner`, `apps/customer-panel`, `apps/storefront-shared`, ortak PostgreSQL16 ve mağazaya ayrılmış medya namespace'i korunur. Yeni işletme için ayrı uygulama, Supabase projesi veya R2 bucket açılmaz. Bu çalışma mevcut NET/SITE staging aktivasyonları içindir; production aktivasyonu kendiliğinden genişletilmez.

Üç teslim grubu vardır:

1. Ortak adres/sertifika altyapısı ve gerçek erişim doğrulaması.
2. Kalıcı kayıt toparlanması ve durum/ilerleme ekranı.
3. Gerçek mağaza kurulum listesi, eksik teslimat ücreti editörü ve işletim görünürlüğü.

## Sabit gereklilikler

- Mevcut kayıt/mağaza tekrar oluşturulmaz; Alpler Spor mevcut hesabıyla doğrulanır.
- Kimlik doğrulama, email verification, immutable issuer/subject, exact-host trust, TLS, üyelik ve tenant isolation korunur.
- Parola, e-posta kodu, ham OIDC/state/handoff/session/status credential ve API anahtarı dosya, test, rapor veya loglara yazılmaz.
- Kayıt sonucu, erişim sonucu ve işletmenin satış ayarları ayrı tutulur; mevcut `provisioningStatus: "ready"` sözleşmesi değiştirilmez.
- Worker yalnız kalıcı doğrulanmış kimliği olan işlemleri tamamlar; oturum veya handoff oluşturmaz.
- `recoveryAbsentAt` süreye veya tek bir SELECT sonucuna bakılarak temizlenmez.
- Aynı işlem özgün tenant payload, idempotency key ve canonical fingerprint ile sürdürülür.
- Mevcut merchant tasarımları/sürümleri, alan adları, ödeme bayrakları ve preview değerleri korunur.
- Gerçek sipariş, ödeme, ücretli plan veya pazarlama işlemi yapılmaz.
- Customer panel ekranları mevcut tasarım sistemini ve `apps/customer-panel/AGENTS.md` kurallarını korur.

## 1. Ortak DNS, TLS ve route doğrulaması

Dört sertifika kapsamı: `*.saas-staging.celebix.net`, `*.admin.saas-staging.celebix.net`, `*.saas-staging.celebix.site`, `*.admin.saas-staging.celebix.site`. Hazır Traefik adayı ayrı `celebix-staging-dns` resolver/deposu kullanır. Mevcut HTTP01 resolver, tekil sertifikalar ve exact router öncelikleri korunur; storefront route'ları mevcut doğru Docker authority middleware'lerini kullanır.

Yeni Cloudflare anahtarı için açık onay beklenir: yalnız NET/SITE zone DNS Write + Zone Read, yalnız `46.225.183.57` ve gözlenen Cloudflare IPv6 egress `2a01:4f8:1c19:75b5::1`. Anahtar henüz oluşturulmadı. Chrome bağlantısı ChatGPT uzantısı güncellemesi istiyor. Bunlar canlı altyapı adımının mevcut dış bağımlılıklarıdır.

Token/private ACME dosyaları sunucuda0600 ve özel klasörde tutulur. Güncel config/ACME/dynamic yedeği ve sekiz mevcut adresin kontrolünden sonra guarded kurulum yapılır. Sertifika doğrulaması kapatılmaz. Olmayan slug'lar geçerli wildcard TLS altında404 döndürmelidir; yanlış tenant kabul edilmez.

Readiness CLI merkezi paneli `/login` üzerinden denetler. Merkezi `/api/health` tenant-specific olduğu için404 döndürür; bu endpoint'in yetki davranışı gevşetilmez. Known tenant health ayrıca `/api/health` ile doğrulanır. Worker sağlıklı görünen farklı mağaza cevabını kabul etmez: expected domain/store authority ile health sonucu bellekte eşleşir.

## 2. Kalıcı worker ve güvenli toparlanma

Owner normal başlangıcına supervised worker eklenir; `CELEBIX_ONBOARDING_WORKER_ENABLED` unset/false iken kapalıdır. NET ve SITE worker'ları kendi onaylı authority profilinin snapshot'larına bağlıdır. Yeni public recovery endpoint veya ayrı kalıcı erişim anahtarı açılmaz.

Mevcut stored registration/verified identity payload'ında environment scope yoktur. Yeni attempt başlarken original validated Owner/panel origin ve platform suffix ayrı immutable authority-scope kaydına aynı transaction'da yazılır. Job, status binding ve access snapshot bu kayda bağlanır; worker kendi profilini taradığı eski attempt'e yakıştıramaz. Legacy attempt ancak saklanmış OIDC transaction authority veya matching committed-operation canonical domain proof'u özgün scope'u kanıtlarsa bağlanır. Kanıt yoksa backfill/worker/status fail closed ve operator attention; kalıcı payload/fingerprint yeniden yazılmaz.

PostgreSQL'de kalıcı job kaydı, attempt başına tek kayıt, due timestamp, retry count, job lease token/expiry ve güvenli outcome code tutulur. Environment-scoped worker heartbeat de kalıcıdır;45 saniyeden eski heartbeat degraded sayılır. Doğrulanmış kimlik kaydıyla job oluşturma aynı transaction'a bağlanır; başlangıçta yalnız kendi ortamının eski eligible işlemleri idempotent taramayla yakalanır. İstek içi `setTimeout`/bellek kuyruğu dayanıklılık otoritesi değildir.

Başlangıç çalışma değerleri: tick15 saniye, batch25, concurrency2, job lease60 saniye, PostgreSQL mevcut statement/lock limitleri en fazla5 saniye. Retry gecikmeleri15,30,60,120,300 saniye; sonra300 saniye, en fazla10 ardışık başarısız deneme. Başarısızlık sonrası `attention_required` görünür, veri silinmez. Yaş5 dakika uyarı,15 dakika operatör alarm eşiğidir. Yeni başarılı işlemin erişim hedefi sağlıklı bağımlılıklar/düşük yük altında doğrulamadan sonra60 saniyedir; bu hedef ölçülmeden başarı iddiası yapılmaz.

Mevcut `reconcileUnknownCommit` aktif attempt advisory lease'ini kontrol eder ve matching committed sonucu doğrulayarak tamamlar. `creating` işlemi yaşlı diye sıfırlanmaz. `absent` read-only READ COMMITTED gözlemidir; eski transaction hâlâ commit edebilir.

Fenced-ready retry için ayrı `claimTenantCompletionRecovery` ve `resumeRecoveredTenantCreation` yolu eklenir. Workflow/completion version CAS, doğrulanmış immutable authority ve nonblocking existing advisory try-lock gerekir. Busy ise transaction hemen rollback edilir. `ready → creating` geçişinde marker tutulur. Tenant Core'un mevcut unique-key `INSERT … ON CONFLICT` arbitrajı eski/geç writer ile yarışı çözer. İşlem anahtarı değiştirilmez, mevcut operation reset edilmez. Session advisory lease, başka bağlantıda aynı advisory xact lock'u alan finalizer çağrılmadan önce bırakılır. Marker yalnız mevcut immutable committed proof finalizer'ı ile temizlenir. Bu claim için mevcut SQL izinleri/constraint yeterlidir; sırf retry için grant veya trigger gevşetilmez.

`processing` pending kalır; mismatch/corrupt/failed operator attention ister. Job lease'i dolan eski worker scheduling yazılarını CAS olmadan yapamaz. Deadline, hâlâ çalışan işlemin lease'ini zorla bırakma yetkisi değildir.

## 3. Oluşturma ve erişim kontrolü

Kalıcı access snapshot; tek committed tenant operation, aktif sahip/mağaza/başlangıç aboneliği, exact canonical admin/storefront domain, yayınlanabilir başlangıç tasarımı ve medya namespace'ini doğrular. Network kontrolleri tenant creation transaction'ı ve completion lease'i dışında yapılır.

Yalnız authority profilinden türetilen exact platform hostlarına DNS/TLS/GET yapılır. Kullanıcı URL'si, arbitrary redirect veya private/link-local hedef kabul edilmez. Platform origin IP/edge haritası explicit allowlist'tir. TLS/SNI doğrulaması açık, timeout5 saniye, body256KiB, yönlendirme en fazla1 aynı host olacak şekilde sınırlandırılır. Bilinmeyen tenant404, bilinen tenant health doğru authority, admin login200 ve public starter200 beklenir.

Snapshot geçerliliği5 dakika; worker due refresh ile günceller. Eski snapshot güncel erişim garantisi gibi sunulmaz. Başlangıç DB/health initialization arızası kalıcı başarısız cache bırakmamalı; bounded/coalesced retry korunur. Boş ürün kataloğu, isteğe bağlı logo veya satış ayarı eksikliği hesabı bozuk saydırmaz.

## 4. Durum ekranı ve devam

Owner hostunda ayrı status-only opaque credential oluşturulur: `os1.` +32 random byte, ayrı keyed-HMAC purpose, yalnız digest saklanır. `__Host-celebix_onboarding_status` cookie HttpOnly/Secure/SameSite=Lax/Path=/, süre24 saat; polling süreyi uzatmaz. Bootstrap ile aynı workflow eşleştirmesi atomik yapılır. Mevcut `pb1` proof'u panel hostuna ait, kısa ömürlü ve hata sonrası silindiği için durable status authority olarak kullanılmaz.

`GET /api/self-serve/status` yalnız cookie ile minimum projection döndürür. Query/body `attemptId` veya slug authority değildir. `/onboarding/status` gerçek ekran olur. Worker yalnız expiry'den en az1 saat geçmiş status binding digest kayıtlarını bounded temizleyebilir; workflow/verified identity/operation/job kayıtları bu cleanup ile silinmez. DTO:

```ts
type OnboardingStage = "awaiting_identity" | "creating" | "checking_access" |
  "ready" | "attention_required" | "expired" | "failed";
type OnboardingStatusDto = Readonly<{
  stage: OnboardingStage;
  updatedAt: string;
  pollAfterMs: 0 | 5000 | 15000;
  loginUrl?: string;        // yalnız ready ve exact canonical admin login
  storefrontUrl?: string;  // yalnız ready ve exact canonical storefront
  messageCode: string;     // allowlisted, ham exception değil
}>;
```

Pending/checking poll5 saniye; transient unavailable503 sonrası15 saniye. Hazır/terminal/expired durumunda otomatik polling durur; hidden tab'da bekler. Durum sorgulanamıyorsa başarısız/başarılı olduğu varsayılmaz. Başka attempt/proof, yanlış origin, expired cookie ve token replay test edilir. URL/localStorage/loglarda credential bulunmaz.

Sağlıklı ilk callback için mevcut initial callback grant/session yolu korunur. Handoff issuer öncesinde yalnız zaten hazır/fresh access snapshot'ı kontrol edilir; yeni DNS/TLS/network probe callback içinde çalıştırılmaz. Bu okuma kalan mevcut transport bütçesinde en fazla100ms alır; bütçe yoksa pending olur. Panel'in mevcut5 saniyelik completion deadline'ı artırılmaz. Hazır olmayan durumda fixed Owner status sayfasına yönlendirilir; OIDC code veya handoff sonra yeniden kullanılmaz. Hazır olunca mevcut exact-destination returning login yeni OIDC transaction ve üyelik kontrolüyle oturum açar. Durum okuyucu/worker initial grant, session veya handoff üretemez.

Pending internal wire protokolü HTTP202 ve exact key order `schemaVersion,kind,statusUrl` ile `{"schemaVersion":1,"kind":"onboarding_pending","statusUrl":"<configured Owner origin>/onboarding/status"}` olur. Mevcut authenticated response signature domain/body/status doğrulaması korunur; public query'den URL kabul edilmez. Panel transport parser, completion handler ve her iki composition/runtime birlikte güncellenir. `CELEBIX_ONBOARDING_STATUS_ENABLED` false default ile Owner yeni variant'ı yalnız rollout sonrasında üretir. Consumer Panel önce, emitter Owner sonra yayımlanır; rollback'te önce Owner emission kapatılır. Mixed-version compatibility testleri gerekir.

Eski Alpler attempt'ine tarayıcı proof'u olmadan status credential eklenmez; normal mevcut hesap girişi kullanılır. Status cookie expired ise veri gösterilmez; mağaza oluşmuşsa normal login, oluşmamışsa destek/toparlanma durumu güvenli biçimde açıklanır. Doğrulanmış/belirsiz attempt için yeni kayıt önerilmez. Doğrulama öncesi kesin expired işlem yeni normal kayıtla başlayabilir.

## 5. Gerçek kurulum listesi ve teslimat ayarı

`/setup` satırları server-established TenantContext ile okunur: erişim, ürünler, yayınlanmış tasarım, mağaza adresi, teslimat ve ödeme. Item durumları `ready`, `action_required`, `unavailable`, `restricted`; veri okuma hatası boş sonuç yapılmaz. Varsayılan yayınlanabilir boş tema yeterlidir; logo/banner isteğe bağlı öneridir. Taslak değişiklikler ile yayındaki tasarım ayrı gösterilir.

Checkout teslimat fiyatı mevcut aktif `merchant_admin_records.shipping_setting` kaydını kullanır. BasitKargo bağlantısı bu ayarı oluşturmaz. Mevcut bağlantı konsolu korunarak ayrı typed editör eklenir: explicit `shippingPriceCents` integer0..100,000,000, sıfır için “Ücretsiz teslimat”, isteğe bağlı `estimatedDays` integer1..365 (storefront commerce parser ile aynı sınır). SQL072 ücret alanını kabul ederken `packages/saas-data/src/merchant-admin/validation.ts` allowed keys hâlâ bu alanı dışlıyor; bu sözleşme farkı düzeltilecek ve tam load/save/checkout round-trip ile sınanacaktır. Draft/activation, version conflict, idempotency ve `configuration.read/manage` korunur. Mevcut diğer payload alanları korunur; regions/free-shipping threshold checkout'ta uygulanmadığı için çalışan kural olarak gösterilmez. Eski checkout davranışı veya mevcut kayıtlar topluca değiştirilmez.

Ödeme satırı offline yöntem, sağlayıcı yapılandırması, test izni, canlı izin ve unavailable sonuçlarını ayırır. Sağlayıcı bağlantısı veya admin image izni storefront canlı execution izni yerine geçmez; ilgili runtime/evidence/adapter authority birlikte okunur. Checklist hiçbir ödeme/kargo sağlayıcısını etkinleştirmez veya çağırmaz.

## 6. İşletim ve yayın kabulü

Sanitized ölçümler: aşama/outcome, retry count, elapsed age ve ayrı purpose-HMAC correlation; ham kimlik/credential yok. NET/SITE counts ve job worker heartbeat Owner super-admin görünümünde gösterilir. Operator retry version/CAS ve aynı güvenli servisi kullanır; force-clear veya yeni idempotency key yoktur. Alarm başlangıçta mevcut log/dashboard kanalındadır; dış e-posta/Slack gönderimi ayrıca yetkilendirilmez.

Gerçek PostgreSQL iki bağlantı testleri eski uncommitted writer'ın commit, rollback ve late-start sonuçlarını kapsar. NET/SITE browser kabulü izole fixture ortamında yapılır; canlı Alpler normal login+admin+storefront doğrulanır. Fixture/mock email doğrulaması gerçek Logto e-posta doğrulamasının kanıtı olarak sunulmaz. Yeni canlı kayıt testi gerekirse yetkili test kimliği ve gerçek kullanıcı kodu gerekir; doğrulama atlanmaz.

Canlı yayın fresh private backup, isolated PG16 up/down/up, exact reviewed SHA, kaynakla bağlı ödeme metadata, sıralı resmi Coolify dağıtımları ve config drift guard ile yapılır. NET shared ödeme kapalı, SITE shared PayTR test/live mevcut kapsamı; Owner SITE test scope mevcut, live kapalı olarak korunur. Worker rollback'te kapatılır, kalıcı attempt/job/proof verisi korunur. Status issuer açıldıktan sonra credential süreleri ve aktif job'lar değerlendirilmeden destructive SQL rollback yapılmaz.

Başarı: Alpler'in gerçek admin/storefront erişimi, yeni izole NET/SITE kayıtları, kesinti sonrası aynı işlemle tek mağaza, doğrulanmış erişim, doğru kurulum listesi ve çalışan worker/izleme kanıtı birlikte geçmelidir. Bu tasarım ve uygulama planı hazırlanmıştır; yeni işlerin tamamlandığı iddia edilmez.
