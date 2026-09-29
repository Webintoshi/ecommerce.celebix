# AI Content Authoring — Faz 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Ürün açıklaması ve ürün SEO'sunu gerçek mağaza bilgilerinden taslak olarak üretmek ve kaydedilen SEO'nun ortak mağazada kullanılmasını sağlamak.

**Architecture:** Mevcut şifrelenmiş AI bağlantısı ve sağlayıcı adaptörlerinden yararlanan ayrı içerik üretim servisi. PostgreSQL işlem kaydı, güvenli şemalı sonuç, editör önizlemesi ve alan bazında normal kaydetme; public SEO için uyumlu v2 okuma yolu.

**Tech Stack:** Mevcut Next.js 16.2.1, React 19.2.3, TypeScript, PostgreSQL, TipTap 3.22.3; yeni AI SDK/veritabanı hizmeti gerekmiyor.

**Spec:** [Araştırma ve tasarım](../specs/2026-09-29-ai-content-authoring-design.md)

**Durum:** Önerilen uygulama planı. Bu istekte uygulama kodu veya canlı değişiklik yapılmadı. Faz 2 ve Faz 3 bağımsız teslimlerdir; aynı spec'teki sınırlarla ayrı uygulama planları hazırlanır.

## Global Constraints

- Aktif hedef apps/customer-panel ve apps/storefront-shared; legacy apps/admin SEO kodu kopyalanmaz.
- Anahtar sunucuda; mağaza/üyelik/yetki sunucuda çözülür. Müşteri, sipariş ve alış maliyeti modele girmez.
- Ölçüler isteğe bağlı; 14,89 g hassasiyeti ve varyant kapsamı korunur. Eksik özellik model tarafından eklenmez.
- Ürün açıklaması normalize HTML ile 10.000 karakter; SEO başlığı 200, SEO açıklaması 500 karakter. SEO yazım hedefleri 50–60 ve 140–160 karakter; bunlar hard limit değildir.
- Ürün AI girdi paketi en fazla 32.768 UTF-8 bayt, 4.096 çıktı tokenı, 45 saniye toplam deadline.
- Varsayılan 100 deneme/mağaza/gün, 6 deneme/kullanıcı+mağaza/dakika, 1 aktif içerik işlemi/kullanıcı+mağaza; günlük sınır yapılandırılabilir.
- Aynı operationId aynı çağrıyı yeniden başlatmaz; farklı girdi operation_mismatch. Belirsiz sağlayıcı çağrısı kendiliğinden tekrar gönderilmez.
- AI yalnız form taslağı oluşturur. Mevcut kayıt/yayın yetki ve sürüm denetimleri korunur.
- Üretim anındaki kaynak fingerprint'i değiştiyse sonuç uygulanmaz; açıklama uygulaması tek adım geri alınır.
- Public v1 bozulmaz. Eski strict parser'a yeni SEO alanları eklenmez; uyumlu v2 yolu ayrı kullanılır.

## Review Focus

- Kayıtlı ürünü değiştirirken kaydedilmemiş ölçüler/variantlar: üretim formun güncel değerlerini kullanır; sunucu mağaza aidiyetini korur. Task 1/3.
- Türkçe ondalık ve varyant çelişkisi: 14,89 g yanlış ölçek/birimle yazılmaz; tek varyant özelliği bütün ürüne yayılmaz. Task 1/3.
- Çift tıklama ve dış çağrıdan sonra kopan bağlantı: aynı işlem ikinci ücretli çağrı oluşturmaz; belirsiz durum güvenli geri bildirim verir. Task 2/3.
- Farklı ürün/mağazaya geçiş veya üretim sürerken yazma: geç gelen sonuç yeni taslağa uygulanmaz; yalnız ilgili mağazanın sonucu okunur. Task 3/4.
- Ayrı ürün/SEO kaydetme sürümleri ve eski storefront consumer: alanlar yanlışlıkla kaydedildi sayılmaz; v1 çalışır, v2 metadata SEO'yu gerçekten kullanır. Task 4/5.

---

## File Structure

Yeni bağımsız modüller:

- packages/saas-contracts/src/content-authoring/{types,validation,index}.ts: private istek/sonuç ve fact paketleri.
- packages/saas-data/src/content-authoring/{types,repository,errors,index}.ts: işlem ve günlük kullanım repository.
- apps/customer-panel/lib/server-content-authoring/{service,facts,runtime}.ts: yetkili kaynak, provider çağrısı, doğrulama.
- apps/customer-panel/lib/content-authoring-http/handler.ts: private HTTP sözleşmesi.
- apps/customer-panel/lib/content-authoring-ui/{client,state}.ts: kaynak snapshot'ı ve UI durum makinesi.
- apps/customer-panel/components/content-authoring/ContentAuthoringPanel.tsx: sade önizleme/uygulama paneli.
- apps/storefront-shared/lib/product-seo.ts: ürün metadata'sı için tek çözümleme noktası.

Mevcut dosyalar görevlerde listelenmiştir. Modül export ve test glob'ları ilgili package index/package.json içinde birlikte güncellenir. AI yetenekleri özellik registry'si ile genişler; bu fazda blog/public blog kodu eklenmez.

## Task 1: Ürün bilgi paketi ve şemalı çıktı

**Files:** Create packages/saas-contracts/src/content-authoring/{types,validation,index,validation.test}.ts; apps/customer-panel/lib/server-content-authoring/{facts,facts.test}.ts. Inspect packages/saas-contracts/src/catalog-onboarding/{types,validation}.ts; packages/platform-config/src/product-description-rich-text.ts.

**Interfaces:**

- ContentAuthoringRequest: draftId=UUID; productId|null; productVersion/profileVersion|null; currentDraft; action=create|improve|shorten|rewrite_selection; fields=description|seoTitle|seoDescription[]; locale; tone; length; note; selection|null.
- currentDraft izinli ürün alanları ve ölçü birimlerinden oluşur; storeId/principalId/provider/secret alınmaz. En az mevcut ürün adı gerekir; özellikler/ölçüler isteğe bağlıdır.
- buildProductFactPacket(savedProduct|null, currentDraft): ProductFactPacket. Kayıtlı ürün sunucudan gelir; doğrulanmış mevcut taslak değerleri kullanılır. Kategori/marka/nitelik/varyant ID'leri tenant-scope çözülür. Omit, boş değer ve silme ayrıdır; silinmiş alan eski DB değerine fallback yapmaz. Sayılar mevcut decimal/ölçü sözleşmesinden dönüştürülür.
- parseContentAuthoringRequest(unknown): ContentAuthoringRequest.
- validateProductDraftOutput(unknown, ProductFactPacket, fields): ContentAuthoringDraft. description blokları izinli paragraph/heading/list/table düğümleri; SEO düz metin. Model linki/factRef'i bağımsız doğrulanır; kaynakta olmayan teknik alanlar kabul edilmez.
- ContentAuthoringDraft: seçilen alanlar için güvenli çıktı, kısa eksik bilgi önerileri ve kaynak fingerprint'i. İzinli olmayan ilave alan reddedilir; modelin confidence puanına güvenilmez. currentDraft tam snapshot'tır; bilinmeyen alan reddedilir. Request ve kaynak fingerprint'leri sunucuda aynı canonical alan/sayı/boş değer kurallarıyla üretilir.

- [ ] Test yaz: title-only girdide ölçüler zorunlu olmamalı; 14,89 g decimal kaynak değeri aynı büyüklük ve g biriminde kalmalı; 0,25 kg için yanlış gram/stock dönüşümü reddedilmeli; karat/taş bilgisi olmayan üründe ilgili yapılandırılmış iddia kabul edilmemeli; variant-only renk ortak fact'e dönüşmemeli; kullanıcı gramajı/markayı boşaltırsa eski değer pakete dönmemeli; başka mağazanın kategori/marka/varyant ID'si reddedilmeli.
- [ ] Çalıştır: node --conditions=react-server --experimental-transform-types --test packages/saas-contracts/src/content-authoring/validation.test.ts apps/customer-panel/lib/server-content-authoring/facts.test.ts. Yeni modüller yokken FAIL; yanlış ondalık/birim kontrolü gerçek davranış üzerinde FAIL olmalı.
- [ ] Yukarıdaki interface ve sınırlarla minimal fact/çıktı doğrulayıcılarını uygula. Bütün doğal dil iddiaları deterministik doğrulanabilir gibi gösterilmez; yapılandırılmış değerler ve sayılar denetlenir.
- [ ] Aynı komutu çalıştır; tüm assertion'lar PASS. Yalnız bu görevdeki dosyaları ve export'ları commit et.

## Task 2: Kalıcı işlem ve kullanım sınırı

**Files:** Create packages/saas-data/src/content-authoring/{types,repository,errors,index,repository.test}.ts. Create apps/owner/scripts/sql/saas içinde uygulama anında seçilen sıradaki migration çiftini; eski migration düzenleme. Test existing tests/saas-phase3 yapısında yeni content-authoring SQL kabul fixture'ı.

**Interfaces:**

- beginGeneration(authority, operationId, requestFingerprint, providerBinding, now): pending|replayed-result|existing-status.
- claimGenerationDispatch(authority, operationId, expectedVersion, now): {claimToken, version, leaseExpiresAt}. Tek CAS galibi dispatch yetkisi alır; claim dış çağrıdan önce kalıcıdır. Claim commit'i doğrulanmadıysa dış çağrı yapılmaz. Lease 60 saniyedir; geç kalan eski token sonucu yazamaz.
- completeGeneration(authority, operationId, claimToken, expectedVersion, validatedDraft, usage|null, now): ContentGeneration.
- failGeneration(authority, operationId, claimToken, expectedVersion, safeCode, dispatchState, now): ContentGeneration.
- getGeneration(authority, operationId): ContentGeneration. Otorite aktüel üyelik ve mağazaya bağlanır.
- ContentGeneration: id, draftId/productId, status=pending|completed|failed|unknown, request/source fingerprint, provider/model/credentialVersion, promptVersion, version, dispatchState, claimToken/leaseExpiresAt (server-only), nullable usage, doğrulanmış özel sonuç, safeCode ve zamanlar. ContentGenerationView HTTP için id/status/draft/sourceFingerprint/usage/safeCode/zamanları taşır; claim/lease tokenı ve credentialVersion içermez.
- Sayaç rezervasyonu beginGeneration ile aynı transaction'da; aynı işlem sayaç/model çağrısını tekrar tüketmez. Denemeler failed/unknown olsa da günlük deneme sayısı olarak tutulur. Expired pending dispatched işlem unknown olur; yeni deneme açık kullanıcı eylemi ister.

- [ ] SQL/repository testleri yaz: yanlış mağaza/kullanıcı denied; aynı ID aynı fingerprint replay; farklı fingerprint mismatch; 100. deneme allowed, 101. denied; 6/dk ve tek aktif işlem yarışında doğru sınır; nullable usage bilinmeyen kalsın; gecikmiş complete eski lease/unknown durumu üzerine yazamasın; eşzamanlı dispatch claim tek galip üretmeli; dispatch öncesi crash sağlayıcıya çağrı yapmadan kurtarılabilmeli; dispatch sonrası crash yeni sağlayıcı çağrısı doğurmamalı.
- [ ] Repository unit testi ve izolasyonlu PostgreSQL kabul testini çalıştır; yeni sözleşme olmadan FAIL çıktısını doğrula.
- [ ] Kontrollü SQL fonksiyonları, RLS/FORCE RLS, version/durum geçişleri ve repository uygula. Ham sağlayıcı zarfı/anahtar loglama; yalnız doğrulanmış özel taslak sonucu sakla. Daily limit yönetimi mevcut AI tercih yetkisine bağlanır, client üretim isteği limit seçemez.
- [ ] Aynı testler PASS; migration up/down fixture'ı ve eski Toshi akışını etkilemediği doğrulansın. Değişen migration/repository/export dosyalarını commit et.

## Task 3: Sağlayıcı ve private HTTP üretim servisi

**Files:** Create apps/customer-panel/lib/server-content-authoring/{service,runtime,service.test}.ts; lib/content-authoring-http/{handler,handler.test}.ts; app/api/content-ai/generations/route.ts; app/api/content-ai/generations/[id]/route.ts. Modify lib/toshi-generation/{types,policy,deepseek,openai,gemini,anthropic,registry}.ts ve mevcut adapter testleri; lib/server-panel-access/postgres-runtime.ts. Reuse lib/server-toshi-providers/runtime.ts.

**Interfaces:**

- generateContent({tenantContext,operationId,request,signal}): ContentGeneration. Task 1 fact/validation, Task 2 repository; server seçilmiş mevcut provider binding'i kullanır.
- Adaptör input'una içerik amacı için optional outputFormat=json_object ve maxOutputTokens eklenir. Default chat davranışı korunur; JSON-schema desteği varsayılmaz. Sonuçta stop/truncation/empty ayrımı normalize edilir; içerik modunda bunlar güvenli hata döner.
- POST /api/content-ai/generations: cookie auth, origin kontrolü, bounded JSON, UUID idempotency-key; gövde Task 1 request. Sonuç yetkili kullanıcıya ContentGenerationView; no-store.
- GET /api/content-ai/generations/:id: aynı store/principal erişimi ve no-store; ContentGenerationView döner. GET yeni provider çağrısı yapmaz. Dispatch sonrası bağlantı kopunca aynı ID ile POST/GET yalnız mevcut durumu okur.
- Mağaza aktif üyelik ve ürün düzenleme yetkisi, productId mağaza aidiyeti, bağlantı iptal/sürüm kontrolü her istekte uygulanır. Araç listesi boş; Toshi geçmişi/araçları yok.

- [ ] Test yaz: client storeId/provider/secret reddedilsin; başka mağaza productId veya generationId denied; üretimde güncel kaydedilmemiş ürün draft'ı kullanılsın; revoked key, empty/truncated/invalid JSON, deadline, prompt injection ve unsupported attribute durumunda sonuç uygulanabilir sayılmasın; eski chat adapter çıktısı değişmesin.
- [ ] React-server şartıyla yeni service/handler testlerini ve mevcut provider adapter testlerini çalıştır; yeni davranış için FAIL doğrula.
- [ ] JSON biçimini resmi provider protokolüne göre ekle; 45 saniye toplam deadline ve boyut/token sınırlarını uygula. Bir üretim işi bir model çağrısı; çağrıdan önce Task 2 dispatch claim'i alınır, sonucu yalnız aynı fencing tokenıyla yazılır. Sessiz fallback/retry yok. Başarıyı DB complete sonrası döndür; uncertain commit/get ve dispatched timeout yollarını mevcut operation ID ile oku, yeniden dış çağrı yapma.
- [ ] PASS doğrula; masked hata ve usage testleriyle log/yanıtta key bulunmadığını kontrol et. Ürün açıklaması save veya publish endpoint'i bu servis tarafından çağrılmamalı. Görev dosyalarını commit et.

## Task 4: Ürün editörleri ve AI kaynağını kaydetme

**Files:** Create apps/customer-panel/components/content-authoring/ContentAuthoringPanel.tsx; lib/content-authoring-ui/{client,state,state.test}.ts; components/catalog/ProductDescriptionField.ai.behavior.test.ts. Modify components/catalog/{ProductDescriptionField,ProductDetailConsole}.tsx; components/catalog-onboarding/ProductAdvancedEditor.tsx; lib/catalog-ui/product-draft-session.ts; ilgili CSS; mevcut catalog/catalog-onboarding save contracts/repository/SQL.

**Interfaces:**

- captureAuthoringSnapshot(currentDraft, selection): snapshot+sourceFingerprint.
- canApplyAuthoringDraft(currentSnapshot,resultSnapshot): boolean. Ürün ID/draft/session/locale/alan metni/ölçüler/seçim değişimi karşılaştırılır.
- applyAuthoringDraft(selectedFields,validatedDraft): yalnız seçilen form alanlarını günceller. Açıklama TipTap transaction/onUpdate üzerinden; defaultValue prop değiştirme ile entegrasyon kurulmaz.
- Alan bazında pending AI origin: generationId, field, generatedContentHash, savedContentHash. Hash'ler sunucuda aynı alan normalizasyonuyla hesaplanır; client hash'i kanıt sayılmaz. Normal save doğrulanmış operation/actor/store/productId veya draftId ile kaynak ilişkisini yalnız başarıyla kaydedilen alanla aynı transaction'da yazar; kullanıcı değiştirirse ai-assisted türetim olarak saklar. Yeni ürün create transaction'ı generation'ın draftId bağını oluşturulan ürün kimliğine taşır; aynı generation başka ürüne bağlanamaz.
- Undo/redo metin ve geçerli alan origin'ini birlikte geri getirir; TipTap history/transaction metadata veya aynı history'ye bağlı origin state kullanılır. Kalıcı geçmiş korunur; eski manuel metin geri gelince aktif alanın AI origin'i yanlış kalmaz.
- Kaynak bilgisi yalnız taslakta kalmışsa published ürün kaydı oluşturulmaz. Mevcut ürün ve merchandising save expectedVersion değerleri korunur; ayrı form save durumları ayrı gösterilir.

- [ ] Test yaz: seçili paragraf dışında metin korunur; uygulama tek undo ile metin+origin birlikte döner, redo aynı AI origin'i getirir; sırada yeni metin/ölçü yazılınca stale sonuç apply edilemez; farklı ürün/mağaza geçişinde geç sonuç kaybolur; uygulanmayan SEO aynı kalır; uygulama dirty, save başarı olmadan saved değildir; profile/product version conflict yeni metni ezmez; field save başarısızken provenance yazılmaz; yanlış productId/draftId generation bağı reddedilir; bir alanın save başarısı diğer alanı saved saymaz.
- [ ] State unit ve gerçek TipTap/happy-dom davranış testlerini çalıştır; FAIL doğrula. Yalnız kaynak kodda string arayan test kalite kanıtı değildir.
- [ ] Mevcut toolbar'a tek AI menüsü, optional ayarlı panel ve alan bazında önizleme/Uygula ekle. Parent editörler ortak taslak köprüsünü yönetir; var olan alanlarda manuel yazma/biçimlendirme korunur. Normal save akışına kaynak ilişkisinin doğrulanması eklenir; AI servisi save yapmaz.
- [ ] PASS; 390 px ve desktop tarayıcıda klavye/odak, kopyalama/liste/tablo/link, yeni/kayıtlı ürün, provider hata ve no-key akışlarını doğrula. Her alanın kaydetme durumu anlaşılır olmalı. Görev dosyalarını commit et.

## Task 5: SEO'yu gerçek mağazaya bağlama

**Files:** Modify packages/saas-contracts/src/storefront/{types,validation,storefront.test}.ts; packages/saas-data/src/storefront/{types,repository,repository.test}.ts. Create apps/storefront-shared/lib/{product-seo,product-seo.test}.ts. Modify apps/storefront-shared/app/products/[slug]/page.tsx ve lib/cache/public-storefront-cache.ts. Add sıradaki yeni SQL migration'da v2 public ürün detay fonksiyonu; v1 değişmez.

**Interfaces:**

- PublicProductV2 ve parsePublicProductV2 ayrı tanımlanır; payload mevcut ürüne nullable seoTitle/seoDescription ekler ve yalnız merchandising profilinden safe public alanlar taşır. V1 PublicProduct/parsePublicProduct/liste/arama/detay payload'ları aynı kalır; v1 parser gevşetilmez. Repository getPublicProductWithSeoBySlug({storefront,now,slug}): PublicProductV2 metodu ile opt-in kullanır; mevcut getPublicProductBySlug v1 döndürmeye devam eder.
- resolveProductSeo(product,displayName): {title,description}. Kayıtlı SEO varsa kullan; yoksa ürün adı/normalize açıklamadan düz metin fallback. Marka suffix'i yalnız bir kez ve açık kural ile uygulanır.
- generateMetadata aynı çözümleyiciyi title/meta description ve uygun sosyal önizleme alanlarında kullanır. Canonical/robots ve ürünün görünür adı değişmez. Katalog/profile save sonrası ilgili public metadata cache yenilenir.

- [ ] Test yaz: saved SEO metadata'ya ulaşır; HTML fallback metne çevrilir; boş SEO fallback; marka eki çift olmaz; v1 strict parser örnekleri hâlâ aynı; farklı tenant SEO sızmaz; save sonrası eski cache sonucu kalmaz.
- [ ] Contract/repository/product-seo unit testleri ve PostgreSQL v1+v2 fixture'ını çalıştır; FAIL doğrula.
- [ ] V2 public okuma, adapter ve metadata çözümleyicisini uygula. DB ilk dağıtılır; v1 istemciler aynı kalır. Yeni consumer eski kayıtları nullable SEO ile okuyabilir. Public cache v1/v2 anahtarları çakışmaz.
- [ ] PASS; pilot mağazada rendered HTML title/meta description/canonical/robots ve ürün görünür açıklamasını doğrula. Panel kaydı tek başına kabul kanıtı değildir. Görev dosyalarını commit et.

## Task 6: Gerçek kalite değerlendirmesi ve pilot

**Files:** Create docs/qa/ai-content-authoring-validation-YYYY-MM-DD.md; güvenli fixture ve değerlendirme sonuçları. Modify ilgili package.json test glob'ları ve mevcut özellik tercih/flag kayıtları; AI altyapısını yeni bir owner deployment gereksinimine dönüştürme.

- [ ] Takı, moda, gıda, elektronik ve dekorasyondan en az 5'er doğrulanmış fixture oluştur; title-only/çelişki/variant/14,89 g örnekleri dahil. Gerçek model değerlendirmesini bağlı provider'ın normal ücretli kullanımı olarak sınırlı ve kayıtlı yürüt; anahtar veya müşteri verisi rapora girmez.
- [ ] Sayı/birim kontrolü ve manuel desteksiz iddia/fayda/tekrar/marka dili değerlendirmesi yap. Kritik malzeme/ayar/sağlık/teslimat iddiası veya tenant hatası varsa yayını durdur; prompt/kuralı düzelt ve etkilenen örnekleri tekrar değerlendir.
- [ ] Değişen workspace'lerde typecheck; ilgili contract/data/panel/storefront testleri ve gerekli build'leri çalıştır. Yeni tests glob'a dahil edilmeli; yalnız doğrudan test komutuyla geçmesi yeterli değil. Başka feature testlerini sadece somut regresyon riski/gerekli gate için çalıştır.
- [ ] Önce migration, ardından AI kapalı uyumlu storefront ve Customer Panel; pilot mağaza flag'i aç. Üretim, önizleme, alan bazında kaydetme, metadata ve kullanım kaydı doğrulanınca ortak admin panellerine aç.
- [ ] Geri dönüşü doğrula: AI flag kapalıyken manuel içerik yazma/kaydetme çalışır; önceki kaydedilmiş içerik/provenance silinmez; eski public okuma kullanılabilir. Kanıtları ve yalnız görev dosyalarını commit et.

## Self-review / kapsam sınırı

- Faz 1 gereksinimleri Task 1–6 içinde; beş Review Focus sınıfının owning testleri görevlerde listeli.
- Aynı isimlerle Request/Draft/Generation, operationId, request/source fingerprint ve alan origin'i kullanılır. Public payload private AI kayıtlarını içermez.
- Blog/sayfa uzun gövdesi, public blog, araştırma modu, kategori/kampanya, çeviri ve toplu üretim Faz 2/3 işleri. Genel özellik tasarımının parçasıdır; bu ilk ürün tesliminin tamamlandı sayılması bunların da tamamlandığı anlamına gelmez.
- Uygulama başında gerçek güncel source/branch ve migration sırası yeniden doğrulanır; burada incelenen d09f7f6c sonrası başka ajan değişiklikleri korunur. Bu planın yazılması uygulama veya deployment kanıtı değildir.
