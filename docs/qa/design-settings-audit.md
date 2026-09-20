# Tasarım Ayarları — hata analizi

Tarih: 14 Eylül 2026. Durum: **ANALİZ TAMAMLANDI; DÜZELTME UYGULANMADI.** Ortam staging, production değil.

## Önce okunacak sonuç

1. **Doğrulanmış kullanıcı sorunları:** Header/menü, renk/yazı, ürün sayfası, yan sepet ve footer ayarını açmak bütün Tasarım ekranını çökertiyor (A01). 1024 ve 390 genişlikte Yayınla/Alanlar/cihaz düğmeleri gizleniyor (A02). Tuval, ana sayfa sırasını ve ikinci/sonraki ürün bölümlerini göstermiyor; boş bölüm listesinde bile örnek içerik üretiyor, V3 footer başlıklarını yok sayıyor (A03). İzole senaryolarda debounce dolmadan sayfadan ayrılma girdiyi kaybettiriyor (A04); sürüm çakışmasında arayüzden kurtarma yok (A05); yayın öncesi kayıt hatası yakalanmamış Promise reddi üretiyor (A06).
2. **Çalışanlar:** Yetkili yeni admin oturumu; Güzide mağaza bağlamı; ilk tasarım yüklemesi; marka ve ana sayfa modalının açılması; mevcut logo/banner görselleri; masaüstünde cihaz seçimi; modal Escape, odağın tetikleyiciye dönmesi ve Tab uçlarının sarılması. Geç gelen eski kayıt cevabı yeni girdiyi ezmiyor. API/repository testlerinde tenant, rol, referans ve sürüm korumaları çalışıyor.
3. **İlk üç öncelik:** A01 açılış çökmesi → A02 tablet/telefon yayın erişimi → A03 taslak önizlemesinin gerçek bölüm modeline uyması.
4. **Kanıt ayrımı:** A01–A03 canlı salt-okunur gözlemle; A01/A03 ayrıca izole kaynak fixture’ıyla doğrulandı. A04–A06 yalnız mock API’li, monte edilmiş React workspace üzerinde doğrulandı. Canlı kaydet/yayınla, veritabanında yeniden okuma, gerçek version-conflict ve cache invalidation denenmedi. Bunlar PASS değildir.
5. **Kısa düzeltme sırası:** Önce V3 uyumunu ve bu açılışı test eden regresyonu ekle; sonra mobil araç erişimini düzelt; sonra preview bölüm/kimlik/sıra tüketimini hizala; ardından taslak ayrılma/çakışma/kayıt hatası kurtarmasını tamamla. Yeni tasarım veya genel refactor gerekmiyor.

## Ortam ve kaynak bağı

- Panel: <https://admin.guzidekuyumcu.com/settings/design>
- Mağaza: <https://guzidekuyumcu.com>
- Mevcut Chrome profilinde oturum bulundu. Görünen etkin mağaza `guzide-kuyumcu-4`, rol `Mağaza sahibi`. Canlı DOM’daki mağaza medyalarının `/stores/…/` kimliği `a828862c-4cc1-475a-89cc-5fbee31eb43f` ile eşleşiyor. Bu, UI/medya bağlamı kanıtıdır; oturum cookie’si veya token’ı okunmadı.
- Güncel Coolify **Running commit** ve son başarılı Panel deployment kaydı: `c09d59a21944fb24ef82cf904db5e444ec1d4fd5`; `celebix-panel-staging-auth01`, deployment `c9xons49la0cdfkb97ko4hsr`, 18:09:32–18:09:49 UTC.
- Güncel mağaza uygulamasının **Running commit** ve son başarılı deployment kaydı da `c09d59a21944fb24ef82cf904db5e444ec1d4fd5`: `celebix-storefront-staging-phase3a4`, deployment `l894vxpekp211thqfav173rc`, 18:15:15–18:17:29 UTC. Önceki rapordaki `bbb2e710…` güncel çalışan SHA kabul edilmedi. Bu audit, yönetim ekranındaki deployment/source kanıtını kullanır; container içi generated build metadata/image digest’i ayrıca okunmadı.
- Eski `bbb2e710ae842dda1875a8b8a74a60098d0fdaf3` ile `c09d59a…` arasında `apps/storefront-shared`, `packages/storefront-design-ui` ve `packages/saas-contracts/src/storefront-design` için diff yok. Bununla birlikte bu kod eşitliği runtime image kimliğinin yerine kullanılmaz.
- Yerel çalışma dizini: `/Users/Celebix/Documents/ChatGPT/Saas-Celebix`, branch `codex/design-tabs-save-fix-live`, HEAD `17e6c10f543917c3c4c85b6d662bce299a8da2ae`. Başlangıçta temizdi. Remote canonical okuması `c09d59a…` döndü. Yerel eski CSS, çalışan CSS diye değerlendirilmedi.
- Testler Git’ten `c09d59a…` exact ağacının `/tmp/celebix-design-audit.mB6M5T` altına çıkarılmış kopyasında çalıştı. Yeni branch/worktree yok. Mevcut bağımlılıklar salt-okunur kullanıldı; başka agent’ın worktree’sinde test veya değişiklik yapılmadı.
- A01/A03–A06 uygulama kodu yerel HEAD ile çalışan ağaç arasında aynı; layout/CSS incelemesinde exact ağaç kullanıldı. İncelenen canonical’da bu sorunları gideren yayınlanmamış bir düzeltme görülmedi; diğer agent branch’leri taranmadı.

## Doğrulanmış bulgular

| ID / Önem | Ekran veya aksiyon / yeniden üretme | Beklenen → gerçek | Kanıt | Dosya / fonksiyon / katman | Kök neden | En küçük düzeltme / sorumlu |
|---|---|---|---|---|---|---|
| **A01 / P1** | Temiz Tasarım açılışı → “Header ve menü”yi aç. Ayrı temiz açılışlardan sepet, ürün, footer; Alanlar → Renk ve yazı. Değer değiştirme gerekmez. | İlgili ayarlar açılmalı → tüm sayfa “Panel geçici olarak açılamadı” oluyor. | [Canlı çökme](evidence/design-settings-audit/live-navigation-crash-1440.png); altı console olayı; fixture A01. | `lib/starter-theme-composer-model.ts:16,41`; `StarterThemeComposer.tsx:200`; `DesignStepEditor.tsx`; **frontend adapter/render**. | `upgradeStarterThemeComposition` V3 input’u `...input` ile taşırken `sectionId`’leri siliyor. Builder’ın önce yazdığı `schemaVersion:2`, input’taki **3** ile eziliyor. V3 parser kimliksiz bölümleri reddediyor. İlk `useMemo` korunmuyor; sonraki try/catch’e ulaşılmıyor. Kapalı “Gelişmiş görünüm” disclosure’ı da child render’ını engellemediğinden renk/yazı açılışı etkileniyor. | V3 bölüm kimliklerini koruyan dar adapter düzeltmesi; sürüm/section yapısını birlikte normalize et; hatayı alan içinde sınırla. Yalnız `schemaVersion`’ı zorlamak veya kimlikleri kalıcı silmek yeterli kabul edilmemeli. **Mira**. |
| **A02 / P1** | 1440’ta açık sayfayı 1024×900 ve 390×844’e getir. | Alanlar, cihaz seçimi ve tek Yayınla aksiyonu erişilebilir kalmalı → tamamı DOM’da olsa da görünmez ve klavyeden erişilemez. Renk/yazı ve duyuru için Alanlar girişi de kayboluyor. | [1024](evidence/design-settings-audit/live-canvas-1024.png), [390](evidence/design-settings-audit/live-canvas-390.png); DOM: ilgili düğmelerin client rect sayısı 0. | Exact `panel-shell.module.css:764`; `PanelLayoutClient.tsx:173`; `DesignWorkspace.tsx` topbarActions; **frontend sunum**. | ≤1024 kuralı `.desktopTopbarCommands > div:first-child { display:none }`; ilk child `#panel-topbar-actions`. Tasarımın alternatif mobil komut alanı yok. | Tasarım komutlarını mobilde de erişilebilir bir yerleşimde tut; bütün shell’i yeniden tasarlama. 1024/390 gerçek computed-visibility testi ekle. **Mira**. |
| **A03 / P1** | Ana sayfa modalındaki sıra/listesi ile tuvali karşılaştır. İzole fixture’da boş bölüm listesi, ürün→kategori→ikinci ürün, V3 özel footer başlığı render et. | Bölüm sırası/varlığı ve ayar etkisi görünmeli → kategori her zaman ürünün önünde, yalnız ilk ürün satırı; boş listede sahte kategori/ürün kartları; V3 footer için varsayılan Mağaza/Yardım/Hesabım. | [Tuval](evidence/design-settings-audit/live-canvas-1440.png), [canlı mağaza](evidence/design-settings-audit/live-storefront-1440.png); fixture A03 gerçek React SSR renderer; canlı modal 4 ürün satırı→kategori→değer önerileri, tuval kategori→yalnız Kolyeler. | `VisualStorefrontCanvas.tsx:65–69`, sabit JSX; `StorefrontDesignRenderer`; mağazada `CampaignHome` / `composeCampaignHomeSections`; **frontend preview tüketimi**. | `.find()` yalnız ilk etkin kategori/ürün bölümünü alıyor, sabit sıralı JSX kullanılıyor. Bulunmayan bölüm için 4 kart fallback’i var. Footer yalnız `schemaVersion===2` durumunda okunuyor, gerçek normalizasyon V3 üretiyor. | Aynı normalize bölüm listesinin sırasını ve görünürlüğünü render et; V3 footer’ı oku; gerçek veri kullanılmıyorsa placeholder niteliğini açıkça etiketle. **Mira**. |
| **A04 / P1** | **Yalnız fixture:** workspace’te alanı değiştir; 700ms dolmadan unmount/navigasyon yap; timer’ı ilerlet. | Değişiklik kaybı engellenmeli/uyarı verilmeli → timer temizleniyor, **0 saveDraft çağrısı**, girilen taslak yeniden açılışta yok. | Fixture A04; mevcut workspace monte edildi, API mock. Canlı mağazada düzenleme yapılmadı. | `DesignWorkspace.tsx:43–68`; **frontend state/ayrılma**. | Debounce cleanup pending save’i iptal ediyor; bu bileşende ayrılma koruması/flush veya taslak kurtarma yok. | Pending/dirty durumda mevcut navigasyon korumasını uygula; güvenli flush/kurtarma ile test et. Bu bulgu **önceden kaydedilmiş verinin silinmesi değil**, henüz gönderilmeyen girdinin kaybıdır. **Mira**. |
| **A05 / P1** | **Yalnız fixture:** autosave 409 `version_conflict`; sonra ikinci yerel düzenleme. | Girdi korunmalı ve kontrollü uzlaştırma/yeniden yükleme yolu olmalı → girdi korunuyor ama Yayınla devre dışı, kurtarma kontrolü yok; ikinci deneme yine eski `expectedDraftVersion:1`. | Fixture A05; API/repository conflict testleri de doğru reddi doğruluyor. | `DesignWorkspace.tsx:46–68,108–115`; **frontend conflict recovery**. | Güncel sürüm yalnız başarıda güncelleniyor. Conflict durumu mesaj/disable’a indirgenmiş; yeniden oku/karşılaştır/retry akışı yok. Backend’in 409 vermesi hata değil. | Girdiyi koruyan açık conflict kurtarması; yeni version’ı körce yazarak korumayı aşma. **Mira**. |
| **A06 / P2** | **Yalnız fixture:** dirty debounce sırasında Yayınla; publish öncesi `saveDraft` unavailable ile reddetsin. | Hata kontrollü sonlanmalı → “Kaydedilemedi” görünürken ayrıca yakalanmamış Promise reddi oluşuyor. | Fixture A06 `unhandledRejection` gözlendi. Yanlış “kaydedildi” iddiası gözlenmedi. | `DesignWorkspace.tsx:78–95`; **frontend async hata işleme**. | `await saveChainRef` ve `await queueSave` publish `try` bloğunun dışında; UI `void publish()` ile çağırıyor. | Flush ve publish’i aynı hata yakalama sınırına al; hata girdisini koru ve güvenli yeniden deneme sun. **Mira**. |
| **A07 / P2** | 1440’ta Mobil seç; 1024 genişliğe getir, sonra aynı Mobil state ile gerçek viewport’u 390 yap. | “Mobil” tuval aynı mobil kırılımı temsil etmeli → dar tuval 1024’te dört kolon/minik kategori ve desktop nav, gerçek 390 viewport’ta farklı grid/nav. | [1024 içinde mobil tuval](evidence/design-settings-audit/live-canvas-1024.png), [gerçek 390](evidence/design-settings-audit/live-canvas-390.png). | `design-settings.module.css:83,98,253–267`; ortak renderer CSS `@media(max-width:720px)`; **frontend preview responsive**. | `data-mode=mobile` yalnız genişliği 390’a sınırlar; iç grid/header CSS’i tuval genişliğine değil dış tarayıcı viewport’una göre kırılır. | Preview mode/container ölçüsünü ilgili responsive kurallara taşı; yalnız genişliği daraltmayı cihaz simülasyonu sayma. **Mira**, A03 kapsamındaki küçük preview düzeltmesinden sonra. |

Bu incelemede yanlış tenant erişimi, kaydedilmiş müşteri verisinin kaybı veya kritik güvenlik ihlali doğrulanmadı; P0 ilan edilmedi.

### A01 için kesin ayırıcı deney

`createDefaultStarterThemeComposition()` tarafından üretilen geçerli V3 yapı, **değiştirilmemiş** `upgradeStarterThemeComposition()` içinde `storefront_contract_invalid` veriyor. Aynı fixture’da `schemaVersion`’ı builder input’una taşımayan tanısal kontrol V2 parse’ını geçiyor. Bu yalnız neden ayırıcı bir deneydir; uygulama fix’i değildir ve bölüm kimliklerini kaybeden dönüşümün doğru tasarım olduğunu kanıtlamaz.

Canlı ilk hata: `2026-09-14T19:17:43.616Z`; bağımsız doğrudan Header düğmesi tekrarı `19:18:17.319Z`. Sepet/ürün/footer ve renk/yazı da aynı hata sınıfını verdi. Ekrandaki “Geçici bağlantı sorunu” başlığı gerçek katmanı yanlış anlatıyor: eldeki kanıt client contract/render hatasıdır. Gerçek HTTP 5xx veya DNS/auth hatası bu olayın nedeni diye sunulmadı.

## Gerçek işlev envanteri ve veri akışı

Ortak akış: server route `requireServerPanelAccess` → rolün `configuration.read` kontrolü → tenant-scoped repository `getWorkspace` → `DesignWorkspace.editor.design`. Düzenleme `applyDesignEdit` ile yeni revision üretir; 700ms autosave `PATCH /api/storefront-design/draft` gönderir. Handler strict document/reference/origin/rol kontrolünden sonra `saveDraft`; kalıcı kaynak `saas.storefront_designs.draft_config/draft_version`. `POST /api/storefront-design/publish` ayrı expected draft/published sürümleriyle `published_config/published_version` üretir. `storefront_design_operations/events` idempotency/audit kaydıdır. SQL dosyaları sadece okundu; DB işlemi çalıştırılmadı.

| Gerçekte bulunan UI / alan | State ve istek | Kalıcı veri ve tüketim | Gözlem sınırı |
|---|---|---|---|
| Logo ve tarayıcı simgesi; görsel seç/yükle | `design.brand.logo/favicon` media reference; workspace `media`; draft PATCH. Yeni tasarım medyası `POST /api/storefront-design/media` | `storefront_design_media`, store-specific object key; draft/published brand; ortak renderer ve storefront frame | Modal, kayıtlı logo seçimi ve görsel yüklenmesi canlı; seçim/yükleme yapılmadı. |
| Ana renk, vurgu, zemin, metin; Varsayılana dön | `design.brand` dört HEX alanı; immutable patch | Published brand → CSS değişkenleri/renderer | Kaynakta mevcut; renk/yazı açılışı A01 nedeniyle canlı erişilemiyor. Renk seçicinin renkli olması hata sayılmadı. |
| Başlık/gövde fontu, kalınlığı, boyutu, font araması | `design.typography`, font katalog istemcisi; draft PATCH | Published typography → font resource/styles | Mevcut typography model/katalog testleri geçti; canlı edit yapılmadı, A01 engeli var. |
| Duyuru şeridi: mesaj, simge, hız, yön, animasyon | `design.announcement`; ayrıca eski composer’da `composition.announcement` alanları | Design announcement → renderer; composition announcement legacy campaign tüketimi | Alanlar → Duyuru navigation step’ine eşleniyor; doğrudan ayrı açılış tekrarı yapılmadı, aynı composer yolu A01 ile bloklu. İki otoritenin yayın önceliği aşağıda açık konu. |
| Header düzeni/zemini/genişliği; kategori menüsü/öne çıkan kategori/görsel | Controlled `StarterThemeComposer.value=design.composition`; kategori/product/page/assets GET yardımcıları | `draft_config.composition` → publish → campaign presentation/header | Açılış canlı çöktü. `Promise.all` kaynak yükleri de composer’da mevcut; runtime hata daha render aşamasında. |
| Sabit ana banner: 1–3 slayt, açık/gizli, başlık/metin, masaüstü/mobil görsel, hedef, ekle/sil/sırala | `design.hero`; medya/destination seçenekleri; immutable slide patch; autosave | Draft/published hero → responsive ortak renderer | Alanlar ve mevcut görseller canlı okunuyor; mutation yok. “Yayında” etiketi local `slide.enabled`’a bağlı, gerçek publication farkını kanıtlamıyor. |
| Ana sayfa: ürün, kategori, ikili kampanya, marka hikâyesi, değer önerileri, yorumlar; sıra/duplikasyon/sil/tek-adım geri al/kalite puanı | `HomepageBuilder` V3 `sectionId`’li composition; reorder/update modelleri; UI undo state | Draft/published composition; campaign section projection/render | Canlı 6 bölüm okundu; sıralama değiştirilmedi. Builder model testleri geçti. Preview A03 nedeniyle birebir temsil etmiyor. Kalite puanı türetiliyor, kalıcı yazılmıyor. |
| Kampanya metni/hedefi ve başlangıç-bitiş zamanı | `design.promotion`; timezone etiketi; datetime-local dönüşümü; PATCH | Published promotion → renderer zaman aralığı kontrolü | Kaynakta mevcut; canlı zaman değiştirilmedi. Mağaza saat dilimi ile tarayıcı saati farklı senaryo açık. |
| Ürün sayfası galeri/SKU/marka/review/ilgili ürün/breadcrumb/ölçü rehberi/bilgi bölümleri; miktar görünürlüğü | `composition.productDetail`, ilişkili `composition.cart.showQuantitySelector` | Published composition → ürün sayfası tüketimi | Açılış A01. Tuvalde statik ürün adı/metni/miktarı; gerçek ürün detay QA’sı değil. |
| Yan sepet güven mesajı/checkout-readiness; shipping progress kontrollü kapalı | `composition.cart` | Published composition → cart tüketimi | Açılış A01. Gerçek sepet veya ödeme çağrısı yapılmadı. |
| Footer tonu/grupları/bağlantıları/bülten/sosyal | `composition.footer` | Published composition → storefront footer | Açılış A01; V3 footer preview A03. |
| Logo/paylaşım ve ana sayfa görsel arşivleri; yükle/arşivle/…olarak kullan | **Ayrı** `StorefrontAssetManager.assets`; GET/POST/DELETE `/api/storefront-assets`; kullanım `merchantAdminApi.records/save` | `storefront_assets`; `merchant_admin_records` theme_setting.logoAssetId / hero_banner.assetId / social_preview.assetId | Ana tasarım `media`/`onChange` yolu değil. Canlı yazılmadı; aşağıdaki H01 ayrımı gerekli. |
| Alanlar menüsü, modal, Masaüstü/Mobil | `location/selectedSurface/modalOpen/previewMode`; yalnız local UI | Kalıcı değil; iframe yok, local draft’tan sentetik canvas | Cihaz düğmesi 1440’ta çalıştı. 1024/390 A02. |
| Taslak kaydı / Yayınla / durum etiketi | `editor.revision`, `savedRevisionRef`, draft/published version refs; seri saveChain | Ayrı draft ve published config; expectedVersion kontrolleri | Backend sınırları fixture’da çalışıyor; UI kurtarma A04–A06. Canlı yayın round-trip denenmedi. |

## Açık riskler / henüz canlı sonuç diye sunulmayanlar

- **H01 — iki farklı görsel kaynağı (yüksek güvenli kod bulgusu, uçtan uca etki açık):** Arşivde “Logo olarak kullan/Hero olarak kullan” ana tasarımı değiştirmiyor; legacy merchant kaydını yazıyor ve “kaydedildi” gösteriyor. Bileşen workspace’e `onChange` callback’i vermiyor. Storefront güncel design yayını ile legacy presentation’ı birlikte tükettiği için logo/banner’ın gerçek önceliği kontrollü fixture’da ayrıca uçtan uca sınanmalı. Canlı “kullan” tıklanmadı. En küçük aday: bu ekrandaki kullan aksiyonunu doğru draft/media otoritesine bağlamak veya legacy etkisini açıkça ayırmak. Mira; API formatı gerekiyorsa backend agent’ı ile dar sözleşme kontrolü.
- **H02 — yükleme hatası/empty metni:** `StorefrontAssetManager.load` hata metnini tutuyor fakat liste boşsa aynı anda “Henüz vitrin görseli yok” da render ediyor. `StarterThemeComposer` yardımcı GET’lerden biri reddedilince genel hata gösteriyor, diğer seçeneklerin başlangıç boş state’i kalıyor. Gerçek canlı HTTP hata cevabı bu görevde yakalanmadı; fault-injection UI senaryosu açık. “Backend ayarları sildi” sonucu çıkarılamaz.
- **H03 — yayımlanmış/taslak statüsü ve ağ timeout:** Autosave başarısı “Taslak kaydedildi” demek, mağazaya yayınlandığı anlamına gelmiyor. Banner “Yayında” etiketi yalnız enabled alanından türetiliyor. Workspace, API’ye timeout/AbortSignal geçmiyor; hiç bitmeyen kayıt saveChain’i bloke edebilir. Gerçek timeout, yayın sırasında eşzamanlı edit ve publish/read-after-write cache senaryosu bu raporda doğrulanmış hata sayılmadı.
- **H04 — domain/cache:** İlk yüklemede runtime/DB hatası sessizce varsayılan tasarıma dönüştürülmüyor; route hata veriyor. Storefront `resolveStorefrontPage` design yoksa unavailable döndürüyor. Public settings cache yolu mevcut; fakat canlı publish yapılmadığından invalidation sonucu ölçülmedi. Custom admin same-origin yolu ilgili handler testinde geçti. Domain geçişi veya cache, A01’in nedeni değil.
- Önizlemede `/` ve `/products` relative anchor’ları var. Pointer tıklaması bu oturumda editör açılış hatasına gitti, eski domaine navigasyon gözlenmedi. Klavyeyle anchor aktivasyonunun storefront/admin hedefi ayrıca sınanmadı; yanlış domain bulgusu ilan edilmedi.

## Canlı kontrol matrisi

| Kontrol | 1440×900 | 1024×900 | 390×844 |
|---|---|---|---|
| Tuval / sayfa yatay taşma | 0 px | 0 px | 0 px |
| Alanlar / cihaz / Yayınla erişimi | Var | **Yok (A02)** | **Yok (A02)** |
| Marka modalı | Açılıyor, görsel yüklü | Açılıyor | Açılıyor; tam genişlik, iç alan kaydırılabilir |
| Ana sayfa modalı | Açılıyor; 6 bölüm okunuyor | Ayrı açılış çalıştırılmadı | Ayrı açılış çalıştırılmadı |
| Header / cart / product / footer / style | **A01 çökme** | Boyuta özel tekrar yapılmadı | Boyuta özel tekrar yapılmadı |
| Klavye | Escape → modal kapanır, tetikleyici odaklanır | Ayrı tam tarama yok | İlk kontrolde Shift+Tab → Bitti; Bitti’de Tab → kapat |
| Mobil preview | 1440 üzerinde düğme ile açıldı | Önceden seçili mode korunur | Önceden seçili mode korunur; düğme yok |

Modalın ilk resize animasyonu sırasında geçici konum değişimi ayrıca hata diye kaydedilmedi. Genel yatay taşma olmaması gizlenmiş aksiyonların erişilebilir olduğu anlamına gelmez. Tüm ekran/alan/cihaz kombinasyonlarının geçtiği iddia edilmez.

Console’da altı `TypeError: storefront_contract_invalid` olayı var. Bu sayfa için ayrı HTTP status/body kaydı veya HAR alınmadı; dolayısıyla “network tamamen temiz” sonucu verilmez. Görüntülenen banner/logo ve storefront görsellerinde gözlenen yükleme hatası yok. iframe sayısı 0; iframe/CSP nedeni doğrulanmadı. Yeni hostname korunuyor; logout yapılmadı, oturum açık bırakıldı.

## Test kanıtı

Kaynak: `c09d59a21944fb24ef82cf904db5e444ec1d4fd5`, Node `v24.11.1`. **119 mevcut test PASS / 0 FAIL / 0 SKIP** (43 + 16 + 60). Tam proje build/test tekrarı yapılmadı. Bunların bir bölümü kaynak-metni assertion’larıdır; gerçek render/mutation kapsamı diye sunulmaz. Özellikle V3→composer açılış regresyonunu mevcut yeşil testler yakalamıyor.

Çalıştırılan ilgili gruplar (exact snapshot kökünden):

```text
node --experimental-transform-types --test
  apps/customer-panel/components/settings/design/*.test.ts
  apps/customer-panel/lib/storefront-design-ui/*.test.ts
  packages/storefront-design-ui/src/*.test.ts
=> 43 PASS, exit 0

node --conditions=react-server --experimental-transform-types --test
  apps/customer-panel/lib/storefront-design-http/*.test.ts
  apps/customer-panel/lib/server-storefront-design/*.test.ts
  packages/saas-data/src/storefront-design/*.test.ts
=> 16 PASS, exit 0

node --experimental-transform-types --test
  apps/customer-panel/lib/starter-theme-composer-model.test.ts
  apps/customer-panel/components/settings/StorefrontAssetManager.test.ts
  apps/customer-panel/components/settings/StarterThemeComposer.test.ts
  packages/saas-contracts/src/storefront-design/*.test.ts
=> 60 PASS, exit 0
```

Ek [izole yeniden üretme betiği](evidence/design-settings-audit/audit-harness.mjs): gerçek kaynak fonksiyonlarını/TSX’i TypeScript ile yükler; canvas için gerçek React SSR; workspace için React+happy-dom, mock API ve kontrollü timer kullanır. Canlı fetch yasaklanmıştır. Child editor/preview/topbar test doubles olduğundan bir tarayıcı uçtan uca testi değildir. Kaynak bileşen değiştirilmemiştir.

```text
node --experimental-transform-types docs/qa/evidence/design-settings-audit/audit-harness.mjs /tmp/celebix-design-audit.mB6M5T
=> exit 0
A01 valid V3 → upgrade throws; diagnostic control passes
A03 empty/order/second product row/V3 footer preview mismatch reproduced
A04 unmount before 700ms → 0 saves
A05 conflict preserves input but repeats stale version; publish disabled
A06 dirty publish/save rejection → unhandledRejection
Control: late save response preserves newer input/dirty state
```

Fixture hazırlanırken geçersiz boş footer grubu gibi test-verisi hataları düzeltildi; bunlar ürün hatası sayılmadı. Son betik tam çalışıp exit 0 verdi. Betikteki REPRO assertion’larının geçmesi uygulama hatasının giderildiği anlamına gelmez; **hatanın tekrar üretildiğini** gösterir. Disposable PostgreSQL kurulmadı/çalıştırılmadı; DB testleri repository mock’larıdır.

## Güvenli görsel kanıtlar

Görseller bu rapora göre göreli ve kalıcı dosya bağlantılarıdır; commit/push istenmediği için sadece çalışma dizininde tutulur. Müşteri/ödeme/credential verisi içermez; mağazanın kamuya açık marka ve katalog görünümüyle sınırlıdır.

| Kanıt | Bağlantı |
|---|---|
| Canlı ayar açılışı çökmesi | [1440 hata](evidence/design-settings-audit/live-navigation-crash-1440.png) |
| Tuval | [1440](evidence/design-settings-audit/live-canvas-1440.png) · [1024](evidence/design-settings-audit/live-canvas-1024.png) · [390](evidence/design-settings-audit/live-canvas-390.png) |
| Marka modalı | [1440](evidence/design-settings-audit/live-brand-1440.png) · [1024](evidence/design-settings-audit/live-brand-1024.png) · [390](evidence/design-settings-audit/live-brand-390.png) |
| Çalışan ana sayfa modalı | [1440](evidence/design-settings-audit/live-homepage-1440.png) |
| Local mobil preview | [1440 ekran içinde mobil tuval](evidence/design-settings-audit/live-mobile-preview-1440.png) |
| Gerçek yayımlanmış mağaza | [1440 storefront](evidence/design-settings-audit/live-storefront-1440.png) |

## Sınır ve devir

Uygulama kodu, .env, auth, DNS, SQL, deployment veya müşteri verisi değişmedi. Kaydet/yayınla, upload/arşiv/kullan, cache temizliği, commit/push/merge yok. Yalnız bu rapor ve kanıtlar oluşturuldu. Staging’in çalışır görünümü ve mevcut oturum korundu; geçici viewport override kaldırıldı.

**Mira’ya devir:** Önce A01 için mevcut canlı V3 şekliyle açılış regresyonu ve kimlik korumalı dar fix; aynı değişikliğe A02/A03’ü kontrolsüzce karıştırmadan sırayla doğrula. Backend/altyapıya doğrulanmış bir düzeltme ataması yok; H01/H04 için ancak frontend izolasyonundan sonra somut sözleşme/cache kanıtı çıkarsa dar görev açılmalı. Bu rapor bir panel işlevsel kabulü veya domain-cutover PASS değildir.
