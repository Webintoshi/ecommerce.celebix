# Güzide mobil tarayıcı deneyimi — görsel öneri

2 Ekim 2026. Durum: **kullanıcı onayladı ve kodlama talep etti**. Onay: “harika evet kodlamanı istiyorum”. Tarayıcı deneyimi bu görsele dayanarak uygulanıyor.

Kullanıcı kapsamı: yalnız tarayıcıda çok akıcı mobil kullanım. Görsel tasarlanacak, kullanıcı onaylarsa kodlanacak.

## Seçilen görsel

[Üç ekranlı tasarım](./mobile-app-experience-concept-2026-10-02.png).

Yerel dosya: `/Users/Celebix/.codex/worktrees/guzide-deniz-theme/Saas-Celebix/docs/design/guzide-kuyumcu/mobile-app-experience-concept-2026-10-02.png`.
Araç: built-in imagegen; bir ilk üretim, bir hedefli düzeltme. Kaynak çıktı: `/Users/Celebix/.codex/generated_images/01a0f11a-700b-7262-82d9-1f30ff77ed5f/exec-50c2e87e-6a64-41fd-8c87-90b98963cdb7.png`.

## Görsel kararlar

- Ana sayfa: mevcut canlı takı kolajı ve ürün bölümleri; boşluklar toparlanır. Logo ve arama/hesap/menü erişimi üst alanda.
- Ana sayfa/katalog: Ana Sayfa · Keşfet · Favoriler · Sepet. Aktif sekme küçük koyu ikon/etiket ile anlaşılır; ince üst çizgi, güvenli alt boşluk.
- Katalog: mevcut gerçek kategori dalları ve ürünler, iki sütun. Filtrele/Sırala mevcut stokta/indirimli/sıralama sözleşmesine dayanmalı; kategori rotasına taşınacak filtrelerin veri uyumu ayrıca doğrulanmalı. Gramaj/ayar gibi doğrulanmamış yeni özellikler görselde yok.
- Ürün: onaylı düğüm kolye galerisi, iki satırlı başlık, tek bağlamsal geri erişimi. Dört sekmeli bar yerini mevcut fiyat + Sepete ekle alanına bırakır; iki alt bar yığılmaz.
- Tam ekran Keşfet menüsü önceki onaylı menüyü açar; menünün kendisi bu görselde yeniden tasarlanmadı. Ödeme ekranına yeni alt navigasyon eklenmez.
- Uygulamada canlı `Bai Jamjuree` font ailesi ve gerçek admin logosu/ürünleri kullanılacak. Raster görsel bir tasarım referansıdır; yeni font seçimi veya üretilen fotoğrafları ürün görseli olarak yükleme kararı içermez. Ekrandaki fiyatlar referans anının örnekleridir, uygulamada sunucudan gelir.
- Akıcılık yalnız bu sabit PNG ile kanıtlanamaz. Kod aşamasında geri dönüş konumu, katman geçmişi, sayaç sürekliliği, seçici ön yükleme ve gerçek telefon doğrulaması yapılmalı.

## Görsel kontrol

Üç artboard ve tüm alt kontroller görünür. Ana Sayfa / Keşfet seçili durumları farklı ve doğru. Ürün ekranında yalnız satın alma şeridi var. İlk görseldeki fazladan tanıtım alanı kaldırıldı; ürün başlığı iki satıra döndürüldü ve çift geri erişimi tek erişime indirildi. Kartlardaki adlar ve örnek fiyatlar canlı referanslarla karşılaştırıldı. Yeni kampanya, indirme veya bildirim yüzeyi yok.

## Referanslar

- `mobile-app-reference-home-2026-10-02.png`: 390×844 canlı ana sayfa.
- `mobile-app-reference-catalog-2026-10-02.png`: 390×844 canlı Kolyeler listesi.
- `live-mobile.png`: onaylı mevcut ürün sayfası.
- `mobile-menu-live-main-2026-10-02.png`: onaylı canlı menü.
- `mobile-app-experience-research-2026-10-02.md`: araştırma ve doğrulanmış kapsam.

## Üretim promptu

```text
Use case: ui-mockup.
Create one polished, high-fidelity design approval image for Güzide Kuyumcu's mobile WEBSITE, showing exactly THREE full-height mobile screen artboards side by side. This is a browser website with app-like navigation, not a native app or installation screen.
Input references: image 1 is the ACTUAL LIVE homepage (keep existing jewelry collage and real product photos/copy); image 2 ACTUAL LIVE necklace catalog (same actual product photos and prices); image 3 APPROVED LIVE product detail (keep the exact knot necklace hero photo, existing title and purchase strip); image 4 APPROVED LIVE full-screen menu (style reference only, do not redesign it).
Visual invariants: retain the exact GÜZİDE KUYUMCU black logo/emblem seen in references, use the CURRENT Bai Jamjuree sans-serif look from screenshot text, no serif, no new font identity. White surfaces, very fine warm-gray rules, near-black text and functional black buttons. Restrained gold #8a6534 only for tiny selected-state detail if needed. Existing brand layout is the foundation. Refine spacing thoughtfully, crisp icons from one thin line family, generous touch targets. No gold framing, no extravagant shadows, no gradients, no giant headings, no pill-heavy UI.
Composition: wide 1800x1200-style landscape board on very pale warm neutral background. Three equal tall flat website screen rectangles with subtle 1px boundary, full screens visible including all bottom controls. Each artboard corresponds to a believable 390x844 mobile viewport. Labels OUTSIDE screens, above each: "Ana sayfa", "Kolyeler", "Ürün detayı". A small calm title outside: "Güzide · Mobil alışveriş". No phone hardware, no notch, no fake iOS status bar, no browser URL bar. Aim for readable accurate Turkish text, sharp 2D UI, not a photographed monitor.
Shared top header: slim compact white header, actual original logo at left (same reference size and no stretching), search, account and hamburger menu icons at right, each with sufficient spacing/touch area. Favorite and cart actions are in bottom navigation on screens 1/2, avoid duplicate clutter in header. On product screen use back arrow + original logo and search/cart/menu access in a coherent slim header.
Screen 1 HOME: preserve current actual warm jewelry collage banner at top, reference 1, with less unused vertical space before existing Kolyeler product rail. Section eyebrow "KOLEKSİYON", heading "Kolyeler", small "Tümünü gör →". Two prominent product images using necklace references, unobstructed hearts. Product captions accurate: "14 Ayar Altın Zincir Hediyelik Kolye 1012" / "₺12.144,00", and "14 Ayar Altın Mor Ren Hediyelik Minimal Kolye 1011" / "₺8.646,00". Low visual weight "Sepete ekle" actions. Show part of next section only if natural. FIXED BOTTOM NAV: four equal tabs with icon ABOVE clear label, exact "Ana Sayfa", "Keşfet", "Favoriler", "Sepet". Home icon/label near-black selected, other labels gray. A thin top border and safe bottom breathing room, no floating card. Bottom nav must be compact ~66px+safe area.
Screen 2 CATALOG: clean back row "← Kolyeler", small category link/chip row "Tümü", "Taşlı", "Sade", "Harf Kolye" connected to actual category navigation, subtle active Tümü. A clean compact row "Filtrele" and "Sırala" (existing supported availability/discount/order filtering only; no fake unavailable attributes). Two-column actual jewelry product grid, equal photos, clean image backgrounds, hearts at top-right. The first four products from reference 2 with accurate names/prices, modest type, product cards preserve the current family. No invented product-count, discount badges, stock quantities or trust claims. SAME fixed bottom four-tab nav, Keşfet selected instead of Ana Sayfa. Last grid row can continue naturally below scroll area but must not be hidden behind bar.
Screen 3 PRODUCT: use exactly the approved knot necklace photo and near-identical gallery presentation from reference 3. Discreet top back path "Kolyelere dön". Large photo on pale background, hint of second image to the right, gallery controls "01 / 02" plus zoom and question icons. Exact product title "14 Ayar Altın Taşlı Düğüm Kolye 960", accurate price "₺31.482,00". Title regular-medium Bai Jamjuree, avoid oversized three-line wrap. Include a small "Ürün ayrıntıları" accordion row if it fits. At very bottom FIXED white purchase strip with price left and black "Sepete ekle" button right matching approved existing product screenshot. IMPORTANT: product screen does NOT also show four-tab navigation; purchase strip replaces it. No overlapping buttons, no second stacked bottom bar, nothing obstructs necklace or title.
Show app-like continuity through aligned headers, consistent spacing, same fine-line icons and clear selected tabs, not through UI slogans. If adding explanatory notes, put just two short captions OUTSIDE beneath the first two artboards: "Tek elle kolay gezinme" and beneath product: "Satın alma alanı her an erişilebilir". No motion arrows inside screens. Keep all artifacts fully visible and aligned. No downloads, install prompts, push notifications, PWA/app-store references, made-up discounts, fake measurements, invented checkout changes. This is an approval concept only, not a live website screenshot.
```

## Son hedefli düzenleme promptu

```text
Use case: ui-mockup / precise-object-edit. Image 1 is the EDIT TARGET: the three-screen Güzide mobile website design board. Image 2 is a supporting reference for the EXISTING approved product title typography. Keep the design board, its three artboards, exact original Güzide logo, actual jewelry photographs, prices, text, white/gray/black palette, existing Bai Jamjuree-like sans serif and bottom controls unchanged EXCEPT these three precise corrections:
1. HOME LEFT SCREEN: remove the invented "ZAMANSIZ ŞIKLIK" promotional teaser and its photo at the very bottom. Replace that small remaining visible content area with a calm white continuation / the start of existing "Bileklikler" section heading, consistent with page scroll. Do not add a new banner or tagline. Keep the two existing products and home-selected fixed four-tab navigation intact.
2. PRODUCT RIGHT SCREEN: restore the readable larger regular-medium TWO-LINE heading matching screenshot 2's scale. EXACT two lines: "14 Ayar Altın Taşlı" then "Düğüm Kolye 960". Do not squeeze the full title into a single long line. Maintain enough spacing for the price below and the existing fixed price+Sepete ekle strip. If needed reduce surplus vertical whitespace before heading and slightly shorten photo height while preserving necklace shape/proportion. Keep the necklace photo itself identical, no redesign.
3. PRODUCT HEADER: remove only the isolated back chevron at extreme top-left. Align the existing logo to the same left position used on home/catalog, preserving search/cart/menu on right. Retain the ONE contextual "← Kolyelere dön" row immediately below header as the back control, so two separate back buttons no longer duplicate.
Everything else is invariant: same beautiful premium simple board, accurate Turkish, catalog grid and all four catalog prices unchanged, selected Ana Sayfa on home and selected Keşfet on catalog, product only purchase strip and NO four-tab nav. No new content, no install UI. Full artboards and their labels stay visible.
```
