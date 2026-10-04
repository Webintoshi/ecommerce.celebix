# Tasarım düzenleme hataları — 4 Ekim 2026

## Hata ve kapsam

Güzide'nin canlı `/settings/design` ekranında dördüncü değer önerisinin başlığı boşaltıldığında `storefront_contract_invalid` hatasıyla tüm panelin hata ekranına geçtiği yeniden üretildi. Uygula çalıştırılmadı; kaydedilmiş tasarım korunarak sayfa yeniden açıldı.

Kaynak: önizleme kaynaklarını seçen istemci hook'u, formun geçici eksik değerlerini render sırasında canlı tasarım sözleşmesiyle doğruluyor. Kaydetme doğrulamasının katılığı korunacak; eksik yerel form düzenlemesi paneli düşürmeyecek.

İlgili inceleme: ücretsiz kargo eşiği alanı, ortak para okuyucusundan önce ilk noktayı virgüle çeviriyor. Böylece `1.000,50` geçersizleşiyor ve `1.000` yanlış tutara dönüşüyor.

## Korunacak işlemler

| Alan | İşlemler |
| --- | --- |
| Değer önerileri | 2–4 değer, simge/başlık/açıklama, ekle/kaldır, özgün başlık, bölüm çoğalt/gizle/kaldır |
| Diğer bölümler | Banner, kategori ve ürün seçimi, ikili kampanya, hikâye, yorumlar, görünüm ve sıralama |
| Genel ayarlar | Marka, menü, duyuru, ürün sayfası, yan sepet, footer, renk ve yazılar |
| Kayıt | Uygula/Vazgeç, sürüm koruması, aynı işlemle tekrar deneme, görsel bekleme, odak dönüşü |

Ürün, sipariş, tahsilat, mağaza sahipliği, native şema ve ödeme yetkileri bu hata düzeltmesinin kapsamına girmez. Vitrin kaynakları yayın tanığı olarak korunur; iki ortak admin hedeflenir.

## İlk doğrulama

Mevcut tasarım/model/önizleme paketi: 114/114 geçti. Bu paket bildirilen eksik alan hatasını kapsamıyordu; yeni davranış regresyonları düzeltmeden önce çalıştırılacak.

## Sonuç

- UI önizleme hook'u eksik ara girdide önizleme isteğini iptal eder; son kaynaklar ve form girdisi korunur. Sunucu/yayın doğrulaması değiştirilmedi.
- Bölüm alanları doğrulama sonucunu Uygula düğmesine iletir. Vazgeç/açma, önceki pencerenin doğrulama durumunu temizler.
- Kargo eşiğinde Türkçe binlik grupları ve nokta/virgül ondalık girişleri ayrıştırılır; geçersiz giriş önceki tutarı değiştirmez.
- RED: eksik başlıkta `storefront_contract_invalid`, eksik bölüm callback'i, Vazgeç sonrası kalan doğrulama kilidi ve `1.000,50` tutarı ayrı ayrı yeniden üretildi.
- Son odaklı tasarım/önizleme/kargo paketi: **121/121**, alan/money/footer/composer/inspector/lifecycle çapraz kontrolü **37/37** geçti.

Ortak `npm test` de çalıştırıldı: 2128 test, 2066 geçti, 61 başarısız, 1 atlandı. Çalışma o sırada eklenmiş kargo RED testini içeriyordu; bu test düzeltme sonrası yukarıdaki son pakette geçti. Diğer 60 başarısız testin tamamı değişiklik öncesi `036531` kaynağından ayrı çıkarılan 17 test dosyasında da başarısız oldu; bu düzeltmeye özgü yeni bir başarısızlık yok. İzole baseline'daki sekiz ek fixture başarısızlığı, Git'e ekli olmayan yerel fixture dosyalarının baseline arşivinde bulunmamasından kaynaklanıyor. Tam paketin ilk aşaması başarısız olduğu için ikinci `react-server` aşaması o komutta çalışmadı. Tasarım HTTP/server paketi ayrıca çalıştırıldı: 15/15 geçti; yetki, origin, tenant, sürüm ve işlem anahtarı sınırları korundu.

Tam paket başarı iddiası yoktur. Eski başarısızlıklar aşağıda adlarıyla kaydedildi. Özel yerel loglar `/tmp/celebix-design-full-tests.log` ve `/tmp/celebix-design-baseline-existing-failures.log` konumunda tutuluyor.

### Değişiklik öncesinde de bulunan başarısız testler


- core admin workspaces do not use decorative outer cards
- detail form settings and analytics page frames stay open
- abandoned cart recovery surface supports reopening and explicit copy
- five typed storefront settings expose exact safe field contracts without secrets
- feed preview authorizes in PostgreSQL before network and returns only canonical products
- design settings is one server-authorized visual storefront workspace
- every donor merchant module route is real and server-authorized
- marketing overview derives all channel counts from durable APIs
- merchant family client executes exact CRUD for every finite kind and every provider preparation kind
- merchant route matrix invokes every actual page, production console, client, and handler across truth and mutation states
- static merchant hubs invoke actual pages and expose only canonical destination links
- design settings mounts the canonical unified workspace
- the actual customer list uses the canonical open frame with a separate inner toolbar divider
- effective scoped graphite keyboard focus: customers/customer-console.module.css
- effective scoped graphite keyboard focus: catalog-onboarding/category-management.module.css
- effective scoped graphite keyboard focus: catalog-admin/barcode-label-studio.css
- effective scoped graphite keyboard focus: orders/order-drafts.module.css
- effective open frame orders/abandoned-cart-console.module.css surface
- effective open frame orders/quick-order-links.module.css panel
- effective open frame orders/order-drafts.module.css formSection
- normal text contrast at least 4.5:1 customers/customer-console.module.css .addressTitle span
- normal text contrast at least 4.5:1 customers/customer-console.module.css small
- normal text contrast at least 4.5:1 orders/order-drafts.module.css dt
- normal text contrast at least 4.5:1 content/policy-console.module.css small
- normal text contrast at least 4.5:1 catalog-admin/barcode-label-studio.css span
- desktop and mobile summary share light palette orders/order-drafts.module.css
- desktop and mobile summary share light palette orders/quick-order-links.module.css
- scoped native choice accent promotions/promotion-studio.module.css
- draft editor line input groups use the warm canvas
- settings and remaining-route controls use the Mira palette without decorative provider colors
- secondary settings controls expose 44px targets, visible focus, and warm editor chrome
- settings forms collapse at tablet width and analytics settings own isolated styles
- domain failure is not rendered as an empty domain collection or a duplicate page hero
- order-adjacent workspaces use the approved Mira palette and graphite primary actions
- ordinary order-adjacent states stay neutral while outcome states remain semantic
- tablet layouts collapse real work grids and keep save-clear actions reachable
- draft mobile action and focus meet the 44px Mira interaction contract
- quick-link recovery focus lands on a visible heading above the sticky action dock
- dashboard loads real durable summaries without tenant authority in the browser request
- dashboard primary action keeps effective AA contrast and a 48px target
- dashboard focus, orange actions, and mobile order links retain accessible contrast and targets
- product and category surfaces receive server-derived delete capability and keep archive separate
- product list follows the approved dense donor toolbar and table contract
- single-row publish switch uses the same narrow versioned status command as bulk actions
- product summary exposes four honest fixed metrics
- product summary cards apply canonical status and stock filters
- mounted store-wide metrics stay semantic and never duplicate loaded-row counts
- mounted list suppresses an old filter response and canonical reload uses the latest filter
- create and edit use one sanitized WYSIWYG description field
- quick creation remains bound to the durable onboarding and media workflow
- advanced editor locks native and rich fields while a versioned save is pending
- category manager presents hierarchy without exposing technical slugs
- category manager keeps create and refresh available at the shell mobile breakpoint with predictable drawer focus
- editor saves and checks the current draft before offering the separate publish action
- editor exposes every controlled merchant field and only server-backed checks and simulator
- editor keeps dirty protection through unload, links, cancel and close, and clears only after saved persistence
- analytics mounts one shared shell while orders keep their existing page-owned and print-safe boundaries
- login and logout remain fail-closed without approved staging auth authority
- catalog subresource pages lock resource kinds in server-authorized routes
- store tools follows design in the shared appearance group used by search and mobile navigation

### Yayın ve canlı kabul

Ortak panel tip kontrolü ve taze üretim derlemesi EXIT 0. Bağımsız incelemede P1/P2 veya işlev kaybı bulunmadı; ilgili dört test dosyası 29/29 geçti. Yayın ve canlı tarayıcı kabulü aşağıda tamamlanacak.
