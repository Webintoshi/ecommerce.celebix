# Sidebar mağaza kimliği — uygulama kontrolü

Tarih: 2026-10-03. Başlangıç: `0ee2e9b6`. Kullanıcı HTML önerisini “evet uygula” ile onayladı. Bu teslimat yerel ortak Customer Panel kodudur; canlı yayın yapılmadı.

## Uygulama

- Mağaza kimliği üstte; yayımlanmış logo mevcutsa 72×56 px contain alanı, yanında görünen ad ve üyelik rolü.
- Logo yoksa veya yüklenemezse doğrudan ad ve rol. Uzun adlar kırpılmadan satıra geçer.
- Celebix logosu ve mevcut Çıkış işlemi altta; masaüstü menü 245 px.
- Çoklu mağazalar üst kimlikte mevcut formdan seçilir. Kapalı seçicinin alanları mobil klavye sırasına girmez; summary erişilebilir.
- Logo verisi mevcut public published repository ve ortak havuzdan gelir. Authenticated store/canonical host ile dönen id/slug/hostname/primaryHostname doğrulanır. Yalnız iki kimlik alanı tarayıcıya aktarılır. Okumalar diğer shell okumaları ile paralel.

## Gerçek bileşen ile tarayıcı kontrolü

İzole yerel fixture gerçek PanelLayoutClient/PanelSidebar kullanır; içerik örnektir. Canlı veri, logout ve mağaza geçişi gönderimleri engellidir. Her altı durum ve yerel görseller HTTP 200 ile doğrulandı.

| Kontrol | Sonuç |
|---|---|
| 1440 px, logo / logosuz / uzun ad / kasiyer | PASS |
| 1024 px, drawer | PASS |
| 390 px, logo ve çoklu mağaza drawer | PASS |
| Sayfa yatay taşması | 0 px |
| Menü araması, barkod alt bağlantısı | PASS |
| Çoklu mağaza seçenekleri ve seçim | PASS |
| Tab: Çıkış → mağaza seçici; Shift+Tab geri dönüş | PASS |
| Escape, odağın tetikleyiciye dönüşü, gövde kaydırma kilidinin kalkması | PASS |
| Bozuk logo → ad, yerleşim kaybı olmadan | PASS |
| Browser error/warn kayıtları | 0 |
| Atlas bağımsız kaynak ve görsel incelemesi | PASS; kalan P1/P2 yok |

Görseller: `evidence/sidebar-store-identity/`. Fixture sayfaları yereldir, canlı panel kanıtı değildir. Drawer breakpoint/exit/focus/dock ve dokunma hedefleri ayrıca mevcut otomatik testlerle doğrulandı.

## Testler ve derleme

- Yeni gerçek bileşen testleri: 4/4 PASS. Mevcut StoreSwitcher testi: 1/1 PASS.
- Published branding/mağaza izolasyonu testleri: 7/7 PASS.
- Son seçili sidebar/drawer/dock test çalışması: 15/15 PASS.
- Customer Panel production build: PASS.
- Son TypeScript kontrolü ve git diff --check: PASS.

Tam uygulama testi yeşil değildir: ilk client aşaması 2027 test, 1976 PASS / 50 FAIL / 1 SKIP; ikinci server aşaması ayrıca çalıştırıldı, 308 test, 307 PASS / 1 FAIL. 49 başarısız test aynı adlarla izole başlangıç commitinde yeniden başarısız oldu. İlk toplu koşuda süreye duyarlı iki test başarısız oldu; hem başlangıç hem güncel kodun ayrı tekrarlarında geçti: signed-out Next entegrasyonu (46.9/29.3 sn) ve bitmeyen HTTP gövdesi deadline testi. İlk hata kayıtları `.tmp/sidebar-full-tests.log` ve ayrı server logunda korundu. Bu sonuçlardan genel suite PASS veya canlı doğrulama sonucu çıkarılmadı.

Odak düzeltmesi sonrası eski HookTestHost yardımcı nesnesi, gerçek DOM'un closest/getClientRects davranışını destekleyecek şekilde güncellendi. Breakpoint/exit testi yeniden geçti. İlgisiz 49 test beklentisi değiştirilmedi.

### Başlangıç commitinde yeniden doğrulanan hatalar

- core admin workspaces do not use decorative outer cards
- detail form settings and analytics page frames stay open
- abandoned cart recovery surface supports reopening and explicit copy
- design settings is one server-authorized visual storefront workspace
- choice loader follows catalog cursors and includes active variants from product 21
- choice loader exposes only server-returned active locations
- choice loader propagates one lifecycle signal through catalog pages details and inventory locations
- every donor merchant module route is real and server-authorized
- marketing overview derives all channel counts from durable APIs
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
- price-list editor is fixed-price, versioned, finite-channel and persisted-tag only
- product list follows the approved dense donor toolbar and table contract
- create and edit use one sanitized WYSIWYG description field
- quick creation remains bound to the durable onboarding and media workflow
- advanced editor locks native and rich fields while a versioned save is pending
- category manager presents hierarchy without exposing technical slugs
- category manager keeps create and refresh available at the shell mobile breakpoint with predictable drawer focus
- login and logout remain fail-closed without approved staging auth authority
- catalog subresource pages lock resource kinds in server-authorized routes
