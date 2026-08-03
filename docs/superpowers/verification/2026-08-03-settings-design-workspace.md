# Settings and Storefront Design Workspace Verification Inventory

## Locked references

- Desktop: `docs/superpowers/concepts/2026-08-03-settings-design-workspace-desktop.png`
- Mobile: `docs/superpowers/concepts/2026-08-03-settings-design-workspace-mobile.png`
- Product contract: `docs/superpowers/specs/2026-08-03-settings-design-workspace-design.md`

The reference images lock hierarchy, density, spacing, preview prominence, and responsive behavior. Visible application copy and controls remain code-native and must match this inventory exactly.

## Allowed first-viewport copy

Tasarım; Marka; Renkler; Yazı; Ana sayfa; Promosyon; Duyuru; Taslak kaydedildi; Masaüstü; Mobil; Yayınla

## Container model

Open white page canvas; one functional preview boundary; no outer editor card; divider-based section rail.

## Tokens

Accent `#FF5A00`; text `#171717`; muted `#667085`; divider `#E8EDF4`; background `#FFFFFF`; control radius `10px`; preview radius `12px`; `48px` minimum targets.

## Typography

Existing panel font; `14px/600` control labels; `13px/500` status; `15px/600` section rows; storefront type comes from the selected design font.

## Desktop behavior

- Existing sidebar and top bar remain the panel authority.
- Section rail, inspector, and preview use divider-based columns.
- The preview is the only large framed region.
- Save state and publish action remain in the top bar.
- The preview-mode control does not move the inspector or reflow the page shell.

## Mobile behavior

- The section rail collapses to one 48-pixel selector that opens an accessible bottom sheet.
- Editor and preview switch without horizontal overflow.
- Controls remain at least 48 pixels tall and use 16-pixel page gutters.
- Publish and draft status remain reachable in the sticky top bar.

## Forbidden regressions

- Redundant in-page title or explanatory hero copy.
- Card grids, floating editor cards, gradients, fake metrics, demo values, or `localStorage` persistence.
- Raw UUIDs, media IDs, arbitrary URLs, or technical provider terms in merchant-facing controls.
- Draft data in the public storefront response.
- A separate writable Hero, Promotion, or Marquee settings surface.

## Acceptance evidence

- Original-detail inspection completed for both reference images.
- Desktop labels and mobile save status were corrected to the locked copy.
- Browser screenshots must be compared against these references at desktop and mobile sizes before deployment.
