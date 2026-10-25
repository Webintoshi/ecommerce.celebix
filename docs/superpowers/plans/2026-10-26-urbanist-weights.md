# Approved Urbanist weight hierarchy

The user approved implementation and rollout of the previously proposed roles:
body 500, buttons/tabs/form labels 600, headings and key numbers 700, helper copy400.

## Function inventory and task

Every page, control, report, form buffer, route and data operation remains as-is.
The task is readability and visible hierarchy across the shared Customer Panel.
The existing local Urbanist binary, preload, fallback and analytics poller stay intact.

## Implementation

1. Add named weight tokens to the existing global stylesheet. Set semantic
   defaults for interface copy, controls, headings, values and helper text.
2. Replace page-local interface weight declarations in place with these tokens.
   Split mixed role selectors and handle font shorthand inheritance explicitly.
3. Preserve merchant-authored content, storefront/theme, campaign/email and print
   preview typography; these represent merchant output rather than panel controls.
4. Make only weight changes in the embedded error/not-found interface stylesheet.
5. Independently review source role mapping and enforce a font-only CSS diff.

## Verification and rollout

Parse all CSS; confirm no changed layout, colors, sizes, assets or application logic.
Inspect representative dashboards, analytics, catalog forms, settings and dialogs
at 1440,1024,390px, including focus, wrapping and helper/input weights.
Run the existing relevant behavioral checks, typecheck and official exact build.
Coordinate a sole publisher, use a new sealed kit and fresh live captures, then
publish NET, accept its exact runtime, publish SITE and verify both/all witnesses.
