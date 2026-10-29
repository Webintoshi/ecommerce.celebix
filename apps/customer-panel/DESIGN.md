# Customer Panel action buttons

The merchant owner's explicit direction on 2026-10-29 supersedes older graphite-primary and 8px action-button defaults. Keep Urbanist and the existing warm-neutral/graphite interface. Action buttons are fully rounded.

The owner's follow-up explicitly includes date, sorting, depot and customer-filter selectors, all select controls, search bars, and filled status/filter chips. These use the same full-round radius, including their visible wrapper when the native field is borderless. Preserve their labels, values, menus, keyboard behavior and existing dimensions. Neutral selectors remain neutral; primary actions remain orange/white. Regular form text/numeric fields, textareas, navigation rows, underline navigation tabs, switches, media drop zones and interactive content cards keep their own geometry. A card does not become a capsule merely because its native element is a button.

| Size | Painted height | Text | Icon | Icon/text gap | Horizontal padding |
|---|---:|---:|---:|---:|---:|
| Large | 56px | 18px | 24px | 8px | 20px |
| Medium | 40px | 16px | 20px | 8px | 16px |
| Small | 36px | 14px | 16px | 6px | 12px |

Medium and Small have a 44px actual target. A transparent 2px/4px border with `background-clip: padding-box` paints the 40px/36px capsule inside that target, without overlapping neighboring targets or hijacking pseudo-elements. Large has a 56px target and no transparent inset. Long labels may wrap rather than truncate the action.

Important existing primary actions use exactly `#ff6c13` and pure white `#FFFFFF` text/icons, including hover/pressed fill. Hover must not underline button labels. Keep the pointer cursor, existing surface feedback and visible graphite keyboard ring. Secondary actions use neutral soft surfaces and dark text; destructive actions retain their danger meaning. Preserve disabled, busy, keyboard and native control behavior.

Form focus has one owner. A composite search or selector uses its outer 1px border to show focus; its borderless native input/select must never draw a second outline or halo. Standalone form fields change their existing border, without stacked rings. Borderless standalone controls retain one thin visible keyboard outline. Keep the separate 2px keyboard ring for action buttons and links.

The product editor uses a compact utility scale: 13px/500 single-line action labels with 32px painted capsules inside 36px desktop targets; formatting tools use 28×32px targets with 16px icons. Coarse pointers retain 44px targets. This localized scale supersedes the larger shared action size within the description toolbar, cover action and SEO action. Classification controls show their real values under external labels, without selection-count or empty-state subtitles. Keep the existing data, form names and handlers; avoid repeated section headings and channel-kind subtitles in the editing rail.

Variant editing follows the same utility scale. Wide lists align image/name, price with tax, stock, codes and actions under one shared header; show a comparison price only when one exists. Measurements sit below the variant name and technical version numbers stay available to assistive technology. Keep “Düzenle” visible and put price policy and archive in the existing neutral overflow menu family, with Escape/outside dismissal and focus restoration. Container-based reflow keeps narrow product columns readable without page overflow. The purpose is quick comparison of actual variants, without repeated labels or a second row of large action buttons.

Explicit appearance exception: white on `#ff6c13` has a 2.835374781:1 contrast ratio. This exact pair is the owner's supplied preference; do not silently replace the requested white or orange, and do not claim WCAG AA text contrast for this pair. This exception does not authorize low-contrast text elsewhere.

Toshi authoring triggers say “Toshi ile oluştur” and use the explicitly requested Sparkles icon. The description trigger belongs to the editor toolbar, with horizontally bounded formatting controls and a deliberate second toolbar row in narrow columns. The authoring workspace uses a quiet balance header, compact selectable field rows, expandable image choices and a separate preview region. Keep credit quotes, retry keys, selected-only application and existing save semantics. Use the shared selection-checkbox style for a white tick on orange; never let native accent rendering choose a dark tick. Variant form save/cancel actions have equal40px heights and equal-width columns, with44px coarse targets.

Use `--cp-button-*` size/radius/color tokens. Keep `--cp-control-*` field tokens independent, and keep `--cp-brand` for charts, selection and established switches. Reading this as a shared operational component grammar: ENERGY 1 / RHYTHM 1 / MOTION 1; uniform button proportions are deliberate across pages, with only purpose-driven size and semantic variants.

The owner’s latest product-form correction explicitly extends capsules to all single-line text, numeric, SKU, barcode and measurement fields in product creation and editing. Apply the same radius to the actual composite outer shell; keep inner borderless fields transparent and clipped by it. Classification disclosure shells stay transparent behind their pill-shaped summary. Native and custom select indicators use matching16px icons and16px end insets. Keep multiline text areas at12px corners and preserve the image/content-card geometry.
