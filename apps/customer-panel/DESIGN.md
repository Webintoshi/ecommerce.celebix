# Customer Panel action buttons

The merchant owner's explicit direction on 2026-10-29 supersedes older graphite-primary and 8px action-button defaults. Keep Urbanist and the existing warm-neutral/graphite interface. Action buttons are fully rounded.

The owner's follow-up explicitly includes date, sorting, depot and customer-filter selectors, all select controls, search bars, and filled status/filter chips. These use the same full-round radius, including their visible wrapper when the native field is borderless. Preserve their labels, values, menus, keyboard behavior and existing dimensions. Neutral selectors remain neutral; primary actions remain orange/white. Regular form text/numeric fields, textareas, navigation rows, underline navigation tabs, switches, media drop zones and interactive content cards keep their own geometry. A card does not become a capsule merely because its native element is a button.

| Size | Painted height | Text | Icon | Icon/text gap | Horizontal padding |
|---|---:|---:|---:|---:|---:|
| Large | 56px | 18px | 24px | 8px | 20px |
| Medium | 40px | 16px | 20px | 8px | 16px |
| Small | 36px | 14px | 16px | 6px | 12px |

Medium and Small have a 44px actual target. A transparent 2px/4px border with `background-clip: padding-box` paints the 40px/36px capsule inside that target, without overlapping neighboring targets or hijacking pseudo-elements. Large has a 56px target and no transparent inset. Long labels may wrap rather than truncate the action.

Important existing primary actions use exactly `#ff6c13` and pure white `#FFFFFF` text/icons, including hover/pressed fill. State feedback uses text decoration or a visible graphite keyboard ring. Secondary actions use neutral soft surfaces and dark text; destructive actions retain their danger meaning. Preserve disabled, busy, keyboard and native control behavior.

Explicit appearance exception: white on `#ff6c13` has a 2.835374781:1 contrast ratio. This exact pair is the owner's supplied preference; do not silently replace the requested white or orange, and do not claim WCAG AA text contrast for this pair. This exception does not authorize low-contrast text elsewhere.

Use `--cp-button-*` size/radius/color tokens. Keep `--cp-control-*` field tokens independent, and keep `--cp-brand` for charts, selection and established switches. Reading this as a shared operational component grammar: ENERGY 1 / RHYTHM 1 / MOTION 1; uniform button proportions are deliberate across pages, with only purpose-driven size and semantic variants.
