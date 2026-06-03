# Celebix Owner Panel Brand Palette

Source logo:
- `https://celebix.net/Logo/koyu%20logo.svg`

SVG extraction result:
- `#2B2B2B` - logo charcoal
- `#FE6100` - logo orange

Brand rule:
- Tum panel tokenlari yalnizca bu iki ana renkten, bunlarin tint/shade varyasyonlarindan veya beyaz ile yumusatilmis karisimlarindan uretilir.
- Mavi, mor veya yesil bir semantic aile kullanilmaz.

## Recommended UI tokens

| Token | Hex | Purpose |
| --- | --- | --- |
| `--brand-primary` | `#FE6100` | Primary CTA, active nav, key highlights |
| `--brand-primary-strong` | `#D95200` | Hover/pressed state for primary actions |
| `--brand-primary-deep` | `#AA4B11` | Premium depth, progress gradients, warm depth tone |
| `--brand-secondary` | `#2B2B2B` | Typography, sidebar base, dark hero foundations |
| `--brand-accent` | `#FFB07A` | Accent glow, highlight edges, premium warm tint |
| `--canvas` | `#F7F1EB` | Light mode app background |
| `--surface` | `#FFFDFC` | Main cards and panels |
| `--surface-2` | `#F6EEE8` | Secondary panels and form shells |
| `--surface-3` | `#EBDDD2` | Tables, pills, muted surfaces |
| `--border-default` | `#E4D5C9` | Default borders |
| `--status-success` | `#A64A12` | Success tone derived from brand orange + charcoal |
| `--status-warning` | `#C95D0D` | Warning tone close to brand orange |
| `--status-danger` | `#6A3B1E` | Danger tone as deep burnt charcoal-orange mix |

## Token usage

| Token group | Use areas |
| --- | --- |
| Primary | Primary buttons, active sidebar item, focus ring, hero accents |
| Secondary | Sidebar base, dark hero base, main text, admin command cards |
| Accent | Hero glow, insight cards, premium highlight surfaces |
| Background / surface | Light mode panel canvas, cards, forms, tables |
| Border | Table borders, cards, muted outlines, form controls |
| Success | Ready badges, completed steps, healthy platform statuses |
| Warning | Pending DNS, waiting states, non-blocking alerts |
| Danger | Risk cards, destructive actions, blocking issues |

## Light mode panel colors

| Area | Token |
| --- | --- |
| App background | `--canvas` |
| Main card | `--surface` |
| Secondary card | `--surface-2` |
| Table / muted pill | `--surface-3` |
| Body text | `--text-primary` |
| Secondary text | `--text-secondary` |
| Borders | `--border-default` |

## Dark hero / sidebar colors

| Area | Token |
| --- | --- |
| Dark hero base | `--surface-dark` / `--surface-dark-2` |
| Sidebar base | `--sidebar-bg` / `--sidebar-bg-2` |
| Sidebar text | `--sidebar-text` |
| Sidebar strong text | `--sidebar-strong` |
| Glow accent | `--brand-primary` + `--brand-soft` |

## Status badge colors

| Status | Foreground | Background | Border |
| --- | --- | --- | --- |
| Accent / active | `#D95200` | `rgba(254,97,0,0.12)` | `rgba(254,97,0,0.28)` |
| Success / ready | `#A64A12` | `#F8EBE1` | `#EFCDB3` |
| Warning / waiting | `#C95D0D` | `#FFF0E4` | `#FFD2B3` |
| Danger / blocking | `#6A3B1E` | `#F4E4D9` | `#DFBFAA` |

## Affiliate dashboard card colors

| Area | Token |
| --- | --- |
| Affiliate hero | Dark hero tokens + orange radial glow |
| Affiliate summary cards | `--surface`, `--surface-2`, `--brand-soft` |
| Commission chips | `--brand-primary`, `--brand-primary-strong` |
| Empty / waiting state | `--status-warning` family |

## Super admin panel colors

| Area | Token |
| --- | --- |
| Command cards | `--surface-dark` / `--surface-dark-2` |
| Repair CTA emphasis | `--brand-primary` |
| Risk surfaces | `--status-danger-soft` + `--status-danger-border` |
| Progress / orchestration | `--brand-primary-deep` -> `--brand-primary` -> `--brand-accent` |
