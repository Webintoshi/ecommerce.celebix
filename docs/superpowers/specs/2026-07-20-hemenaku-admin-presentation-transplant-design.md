# Hemenaku Admin Presentation Transplant Tasarımı

**Tarih:** 2026-07-20

**Durum:** Yaklaşım onaylandı; yazılı spec incelemesi bekleniyor

**Uygulama tabanı:** `6563a1428434e1974f50af3ffb843eb4067f686a`

**Read-only donor:** `apps/admin` @ `fc6c5318b47f045a7cefcedc7612d5b10563ba32`

**Hedef uygulama:** `apps/customer-panel`

## 1. Amaç

Mevcut ortak SaaS customer panelinin görünümünü ve desteklenen etkileşimlerini canlı Hemenaku admin paneliyle ölçülebilir biçimde eşleştirmek. Donor arayüz sıfırdan yeniden tasarlanmayacak; sunum bileşenleri ve davranışları hedef uygulamaya taşınıp mevcut PostgreSQL session, `TenantContext`, catalog ve media authority'lerine adapte edilecek.

İlk test-ready teslimat şunları kapsar:

- exact Celebix marka sunumu, koyu sidebar, sticky topbar, page chrome ve responsive navigasyon;
- donor dashboard kart, sekme, grid, toolbar, loading, empty ve error geometrisi;
- mevcut gerçek catalog summary verisinin donor dashboard diliyle sunulması;
- ürün listesi, yeni ürün, ürün detayı, varyasyon ve medya yüzeylerinin donor görünümüne uyarlanması;
- donor desktop/mobile davranışlarının klavye, focus, drawer, dock ve reduced-motion kontrolleri;
- sahte KPI, legacy authority, `/api/admin/**` veya browser tenant authority eklenmemesi.

Bu teslimat yeni order/customer/analytics backend'i icat etmez. Bu domainler gerçek shared-SaaS authority ile tamamlandıkça aynı transplant modeliyle açılır.

## 2. Sabit kararlar

1. `apps/admin/**` byte-for-byte read-only kalır.
2. Donor referansı yalnız exact `fc6c5318...` commit'idir; hareketli branch donor olamaz.
3. Hedef yalnız `apps/customer-panel` olarak kalır.
4. Authentication ve tenant authority zinciri değişmez: `__Host-celebix_panel` → durable PostgreSQL session → `TenantContext`.
5. Full `TenantContext`, principal/store/membership UUID'leri, provider subject, cookie veya token client component'lere geçmez.
6. Donor Supabase, legacy Logto admin session, `STORE_RUNTIME`, store-info context ve `/api/admin/**` kodları taşınmaz.
7. Donor presentation code'u adapte edilir; donor data/auth/runtime code'u adapte edilmez.
8. Gerçek HTTP API ve kalıcı authority'si olmayan mutation çalışıyormuş gibi gösterilmez.
9. Bir modülün navigation girdisi ancak onun tenant-filtered read/write akışı gerçekten çalıştığında aktif link olur.
10. Iframe, reverse proxy, ikinci admin uygulaması ve `apps/admin-shared` oluşturulmaz.
11. Production deploy, credential değişikliği, production data mutation ve merge bu tasarımın uygulama yetkisi değildir.

## 3. Hızlandırılmış yaklaşım

### 3.1 Presentation transplant

Donor markup, spacing, tokens, icons ve interaction state'leri hedefteki küçük ve güvenli component sınırlarına taşınır. Aynı görünümü yeniden keşfetmek yerine aşağıdaki donor bileşenleri kaynak kabul edilir:

| Donor | Hedef | Karar |
|---|---|---|
| `apps/admin/app/globals.css` | `apps/customer-panel/app/globals.css` ve CSS modules | Admin tokenları, reset ve responsive kurallar |
| `apps/admin/public/Logo/celebix-beyaz-logo.svg` | `apps/customer-panel/public/Logo/celebix-beyaz-logo.svg` | Exact asset copy |
| `AdminPageShell.tsx` | `PanelPageShell.tsx` | Presentation primitive'lerinin rename/adapt transplant'ı |
| `AdminLayoutClient.tsx` | `PanelLayoutClient.tsx` | Shell, topbar ve mobile surface composition |
| `AdminSidebar.tsx` | `PanelSidebar.tsx`, `PanelNavigation.tsx` | Visual markup ve expandable group davranışı |
| `DashboardHomeView.tsx` | `PanelDashboardHomeView.tsx` | KPI rail, grid, chart surface ve lower panels |
| `ProductsPageClient.tsx` | `ProductListConsole.tsx` | Toolbar, table/mobile cards ve states |
| product wizard bileşenleri | `ProductCreateForm.tsx`, `ProductDetailConsole.tsx`, `ProductMediaManager.tsx` | Form/wizard/media sunumu |

Donor source topluca kopyalanmaz. Her port edilen dosyada donor authority importları kaldırılır ve target adapter'ları enjekte edilir.

### 3.2 Authority adapters

Presentation bileşenleri `TenantContext` veya repository bilmez. Yalnız immutable view-model ve command port'ları tüketir.

```ts
export type AuthoritySlice<T> =
  | Readonly<{ state: "ready"; value: Readonly<T>; asOf: string }>
  | Readonly<{ state: "empty"; message: string }>
  | Readonly<{ state: "locked"; feature: string }>
  | Readonly<{ state: "unavailable"; retryable: boolean }>
  | Readonly<{ state: "unsupported"; capability: string }>;

export interface MerchantDashboardViewModel {
  readonly catalog: AuthoritySlice<CatalogDashboardViewModel>;
  readonly orders: AuthoritySlice<never>;
  readonly analytics: AuthoritySlice<never>;
  readonly customers: AuthoritySlice<never>;
  readonly carts: AuthoritySlice<never>;
}
```

Command port'ları mevcut API client'larını sarar:

```ts
export interface MerchantCatalogCommands {
  readonly list: typeof catalogApi.listProducts;
  readonly get: typeof catalogApi.getProduct;
  readonly create: typeof catalogApi.createProduct;
  readonly update: typeof catalogApi.updateProduct;
  readonly archive: typeof catalogApi.archiveProduct;
}

export interface MerchantMediaCommands {
  readonly list: typeof productMediaApi.list;
  readonly upload: typeof productMediaApi.upload;
  readonly updateAlt: typeof productMediaApi.updateAlt;
  readonly reorder: typeof productMediaApi.reorder;
  readonly archive: typeof productMediaApi.archive;
}
```

## 4. İlk teslimatta gerçek olarak desteklenen davranışlar

Mevcut target authority aşağıdaki donor yüzeylerini gerçek veriyle bağlamaya yeterlidir:

- authenticated shell ve logout;
- safe store slug, membership label, plan/version, locale ve verified hostname;
- ürün listeleme, pagination ve detail;
- ürün oluşturma, güncelleme ve archive;
- varyasyon oluşturma, güncelleme ve archive;
- medya listeleme, upload, alt text, reorder ve archive;
- toplam/active/draft ürün;
- ürün limiti;
- active ve out-of-stock varyasyon;
- medyası olmayan ürün ve active medya toplamı.

`out-of-stock` değeri donor `low-stock` etiketiyle yeniden adlandırılmaz. Exact threshold query gelmeden düşük stok sayısı uydurulmaz.

## 5. Dashboard parite sözleşmesi

Dashboard donor'ın şu geometry'sini korur:

- üst satış kanalı/dönem rail'i;
- beş metrik sekmesi;
- ana chart yüzeyi;
- kanal durumu satırı;
- terk sepet ve mağaza durumu panelleri;
- son sipariş ve stok paneli;
- büyüme metrikleri alanı.

Authority bulunmayan alanlar numeric `0`, yapay trend veya örnek record üretmez. Aynı grid alanında açık `unsupported`, `locked` veya `unavailable` durumu gösterilir. Gerçek authority gelene kadar period/channel selector'ları disabled olur ve dead mutation/link üretmez.

Catalog summary alanları gerçek değerlerle donor KPI kartlarına bağlanır. Store, role, plan ve hostname yalnız server-produced `PanelChromeModel` üzerinden gösterilir.

## 6. Navigation sözleşmesi

İlk teslimatta active navigation yalnız çalışan route'ları içerir:

- `/`
- `/products`
- `/products/new`
- `/products/[productId]`
- `/setup`

Görsel grouping, row density, icon box, active rail ve submenu dili donor ile eşleşir. Donor `/admin/*` URL'leri target'a taşınmaz.

Orders, customers, discounts, marketing, CMS, settings mutation, accounting, marketplace, SEO, notification ve Toshi girdileri ancak ilgili shared authority tamamlandığında active link olur. Bu kural tam özellik paritesi programını durdurmaz; her domain ayrı adapter batch'i olarak paralelleştirilebilir.

## 7. Bağımlılık sınırı

Her runtime dependency target workspace'te direct dependency olarak beyan edilir; root hoisting authority kabul edilmez.

İlk transplantın kesin runtime dependency set'i:

- mevcut `lucide-react`;
- donor dashboard chart geometry'si için direct `recharts`;
- donor drawer ve surface motion davranışı için direct `framer-motion`.

Target CSS Modules ve mevcut class composition yaklaşımı korunacağı için `clsx` ve `tailwind-merge` eklenmez. Notification/Toshi teslimata girmediği için `sonner` eklenmez. Rich editor, DnD, Radix ve yeni form paketleri bu teslimatta eklenmez. Lockfile değişikliği yalnız `recharts`, `framer-motion` ve bunların npm tarafından çözülen transitif bağımlılıklarıyla sınırlı kalır.

## 8. Hata ve güvenlik davranışı

- Session veya `TenantContext` doğrulanamazsa shell render edilmez.
- Catalog/media API 401/403/404/409/503 durumları mevcut kontrollü mapping'i korur.
- Loading yalnız gerçek pending request sırasında görünür.
- Empty state gerçek boş result'tan üretilir.
- Unsupported state request göndermez.
- Error copy SQL, driver, cookie, token, subject veya infrastructure bilgisi içermez.
- Browser request hiçbir tenant/store ID header'ı göndermez.
- Cross-store ID ve stale version mutation'ları fail-closed kalır.
- Donor storefront preview URL'leri target verified hostname olmadan oluşturulmaz.

## 9. Test-first uygulama sınırları

Her transplant batch'i RED → GREEN → REFACTOR döngüsünden geçer:

1. donor geometry/interaction veya adapter contract testi yazılır;
2. test beklenen nedenle fail eder;
3. minimal port/adaptation yapılır;
4. focused test, nested catalog/media testleri ve typecheck çalışır;
5. batch bağımsız commit edilir.

Zorunlu doğrulamalar:

- customer-panel workspace testleri;
- doğrudan package script'ine dahil olmayan catalog/media/server route testleri;
- Phase 3 shell/dashboard static ve in-process testleri;
- typecheck ve production build;
- donor SHA ve `apps/admin/**` diff = 0;
- banned import, `/api/admin`, Supabase, browser authority ve secret scan;
- authenticated desktop/mobile screenshot ve interaction acceptance.

Viewport matrisi:

- `1440x1024`
- `1280x800`
- `1025x768`
- `1024x768`
- `390x844`
- `320x720`

Kabul değerleri:

- desktop/mobile sınırı: exact `1025px`;
- horizontal overflow: `0`;
- interactive target: en az `48x48px`;
- primary CTA contrast: en az `4.5:1`;
- reduced motion: yaklaşık `0.01ms`;
- drawer Escape/backdrop/close/swipe ve focus return: PASS;
- console/runtime secret ve credential leak: `0`.

## 10. Hızlı uygulama batch'leri

1. Styling foundation ve exact logo: 1.5–2 saat.
2. Responsive donor chrome transplant: 3–4 saat.
3. Donor page primitives ve truthful dashboard: 3–4 saat.
4. Product list presentation transplant: 2.5–3.5 saat.
5. Product create/detail/media transplant: 3.5–4.5 saat.
6. Security, test, typecheck, build ve screenshot acceptance: 3–4 saat.

İlk test-ready shell + dashboard hedefi 11–16 saattir. Mevcut gerçek catalog/media fonksiyonlarının donor presentation'ıyla tamamı 18–25 saatlik hedef banttır. Tahmin planlama bekleme süresini içermez; parallel agent grupları bağımsız batch'leri eşzamanlı yürütebilir.

## 11. Tam özellik programı

Order, customer, analytics, cart, discount, marketing, CMS, marketplace, accounting, payment, shipping, staff, SEO, notification ve Toshi davranışları presentation transplant ile görünür hâle getirilmeden önce tenant-filtered domain authority gerektirir.

Bu domainlerde donor presentation yine yeniden yazılmaz. Her domain için aynı kalıp kullanılır:

1. immutable contract;
2. PostgreSQL migration/repository;
3. authenticated same-origin API;
4. donor presentation adapter;
5. concurrency/isolation/security tests;
6. navigation activation.

Bu tasarım, hızlı görünüm transplant'ını gerçek backend paritesi programından ayırır; ancak ikisini aynı customer-panel ve aynı `TenantContext` authority altında tutar.
