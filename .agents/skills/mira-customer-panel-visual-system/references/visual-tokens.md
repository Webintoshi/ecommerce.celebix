# Celebix Operations Visual Tokens

Use these Customer Panel design tokens instead of page-local values. Keep the repository's existing font stack; add no external font.

## Color tokens

```css
:root {
  --cp-canvas: #F6F7F8;
  --cp-surface: #FFFFFF;
  --cp-surface-subtle: #FAFAFA;
  --cp-sidebar: #191C20;
  --cp-sidebar-raised: #23272D;
  --cp-border: #E4E7EC;
  --cp-border-strong: #D0D5DD;

  --cp-text-primary: #17191C;
  --cp-text-secondary: #667085;
  --cp-text-muted: #98A2B3;
  --cp-text-inverse: #F9FAFB;

  --cp-accent: #B4873B;
  --cp-accent-strong: #8A6427;
  --cp-accent-soft: #F6EFE3;

  --cp-action-primary: #191C20;
  --cp-action-primary-hover: #2A2E34;
  --cp-action-primary-text: #FFFFFF;
}
```

Do not place low-contrast white text on gold. Gold is a measured brand detail for the active sidebar marker, selected tab, small chart emphasis, focus detail, or limited brand cue—not the default CTA fill.

## Color budget and semantics

- Page titles, KPI values, table text, and normal copy: `--cp-text-primary` or neutral secondary/muted text.
- KPI icons: neutral, or one consistent `--cp-accent-soft` treatment.
- Default chart: accent main series, graphite/gray comparison, light-gray grid, medium-gray axes.
- More than one series: at most four desaturated, WCAG-distinguishable encodings; add labels/patterns so color is not the only discriminator.
- Success, warning, error, and information colors require corresponding meaning plus text/icon. Define them through an existing shared semantic token system; do not invent page-local semantic hex values.

**Forbidden:** “Satış turuncu / Sipariş mavi / Müşteri mor / Dönüşüm yeşil.” Correct: all KPI values are dark graphite; only a small trend/status indicator is semantic.

## Typography

| Role | Size | Weight | Notes |
|---|---:|---:|---|
| Page title | 24–28 px | 650–700 | Never exceed 28 px on normal screens. |
| Section title | 18–20 px | 600–650 | Compact hierarchy. |
| Card title | 14–16 px | 600 | Neutral. |
| Body | 14 px | 400–500 | Primary or secondary neutral. |
| Table | 13–14 px | 400–500 | Optimize scanning. |
| Helper | 12–13 px | 400–500 | Maintain AA contrast. |
| KPI value | 24–30 px | 650–700 | Dark neutral, never category-colored. |

No giant hero headings, long all-caps copy, decorative weight proliferation, or more than a short contextual eyebrow.

## Spacing and density

Use only `4, 8, 12, 16, 20, 24, 32, 40` px unless an existing shared primitive requires a documented exception.

| Element | Standard |
|---|---|
| Desktop main padding | 24–32 px |
| Tablet padding | 20–24 px |
| Mobile padding | 16 px |
| Table row | 44–48 px |
| Input | 40–44 px |
| Button | 40–44 px; touch target remains at least 44×44 px |
| Page header | Normally no more than 96–128 px high |

Do not introduce 13, 19, 27, or 37 px one-offs. Premium means precise and economical, not oversized.

## Shape, border, and elevation

| Element | Radius |
|---|---:|
| Input | 8 px |
| Button | 8–10 px |
| Card | 10–12 px |
| Drawer/modal | 12–16 px |

Use 1 px neutral borders. Shadows belong only to modal, popover, dropdown, or a sticky elevated panel. Avoid glassmorphism, neon glow, colored shadows, heavy blur, strong gradients, and heavy card shadows.
