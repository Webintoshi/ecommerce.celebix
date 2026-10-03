# Lilyum Flora accepted homepage

Approved image: approved-homepage.png (1536 × 1024 desktop/mobile board). User approved implementation on 2026-10-03. Delivery adjustment explicitly approved: delivery information and store contact links; no unimplemented district/date availability controls. Delivery information opens in a native details disclosure. Store contact uses the published support email; public contact/FAQ pages currently have no body content. Published brand-story contact information is also displayed inside the disclosure when present.

## Locked design

Warm ivory #f7f4ee, botanical green #24493b, gold #b58a53, charcoal #171b1a, hairline #dedbd4. Preserve the tenant's published typography (currently Poppins). Regular/medium headings, no heavy rounded tiles. Buttons 6px radius, 44px minimum mobile targets. Header compact, logo left, category navigation center, utility icons right. Outline icons 1.5–1.7px; selected home filled. No hero tint or gradient.

Hero: naturally lit pink lilies, white gerberas and foliage in clear vase on pale stone, bouquet on right, negative space on left. Desktop headline scales from 38–60px (41.45px at the board's 987px width), mobile 31px; mobile photograph above copy (180px high). Exact default copy: “LILYUM FLORA · ORDU”; “Sevdiklerine bir güzellik gönder.”; “Özenle hazırlanan taze çiçekler, anlamlı anlar için.”; “Çiçekleri keşfet”. Announcement “Ordu’da aynı gün çiçek teslimatı”. Delivery strip now: “Nereye gönderelim?”; “Teslimat bilgisi”; “Mağazayla iletişime geç”. Category heading “Koleksiyonlarımız”, two large images per row, “Keşfet”. First product row default heading “Bugünün çiçek seçkisi”, real titles/prices/media, favorite heart and “İncele”. Footer deep green, real logo, delivery/contact links, expandable published policy groups and Celebix signature. Mobile tabs “Ana Sayfa”, “Keşfet”, “Favoriler”, “Sepet”.

## Admin compatibility

Exact tenant ID guard only. Keep published navigation including all categories and children, full product names, current money/availability, footer/policies/social links, existing favorite/cart providers and routes. Existing legacy hero image/headline migrate to approved theme defaults; subsequently changed admin hero images/text override those defaults. Disabled/removed sections remain absent. Keep additional enabled admin product sections below the initial selected row, using the same card family. All category records remain discoverable, displayed as large pairs. Design publication overrides remain authoritative for logo, fonts and custom hero. Checkout and product pages do not receive an overlapping bottom bar.

## Asset

Built-in Image Gen, reference = accepted concept. Production image: apps/storefront-shared/public/themes/lilyum/flower-atelier-v1.webp. Prompt: natural editorial photo, abundant pale pink lilies/white gerberas/baby’s breath/eucalyptus in clear cylindrical vase, pale stone console, warm ivory curtain background, wide 3:1, bouquet right half, left 45% negative space, no text/logos/UI/color wash. Optimized WebP, 2164 × 727px, 126194 bytes; original retained in Codex generated images. Existing admin category/product media are used unchanged. Product images fit completely inside their card using an explicitly constrained image box.

## Status

Code and local browser preview completed. The initial code-only phase did not publish live changes. The user subsequently authorized live publication. The release is based on the latest deployed source and uses the existing guarded storefront publication process. QA screenshots and the fidelity ledger are stored outside the repository in the Codex visualizations directory. The browser fixture is a local-only public-data snapshot; production rendering consumes the existing campaign projection and providers.
