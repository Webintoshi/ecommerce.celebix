# Genel Bakış: approved Urbanist language

**Goal:** Apply the already approved analytics language to the existing home dashboard and publish both shared panels.

**Architecture:** Presentation-only changes in the existing dashboard TSX and CSS module. Preserve data loading, formatters, period generation guards, retry ownership, active visitor lifecycle and cashier permissions. No new library, font, request, API, schema or payment change.

## Function inventory

- Primary task: scan selected-period performance and act on the highest priority store work.
- Preserve four KPI authorities, selected period/range, live visitors and manual-sale lock/upgrade route.
- Preserve actual sales series/currency/dates plus accessible/mobile values; no invented conversion rate.
- Preserve five recent orders and every detail field/link, five top products with image/quantity/revenue.
- Preserve setup/media/order/stock/cart priorities, individual task links and per-slice retries.
- Preserve order ring totals and categories, storefront identity/setup, update time, plan version, growth and customer/cart summaries.
- Preserve four quick actions and all cashier-specific filtering/read restrictions.
- Preserve independent loading/error/empty states, same-period DOM retention, stale response protection and permission revocation.

## Presentation decisions

- Compact page toolbar and four-column KPI strip; neutral icons and 500/600/700/400 Urbanist roles.
- White bordered sales panel beside a compact priority/task column, then dense recent orders beside top products.
- Existing extra metrics and store information remain in a keyboard-accessible native disclosure.
- Existing outlined illustration family, shared palette, no bitmap asset or animation.
- Replace accumulated CSS overrides with a single responsive module; no giant mobile height reserve.
- Main manual sale is the only dark primary action. Other links remain visibly actionable with pale/quiet treatments.

## Execution and verification

- [ ] Implement JSX/artwork hierarchy and clean CSS while freezing actual loading/data code.
- [ ] Run dashboard behavior/model tests; verify disclosure, all fields/actions and permission behavior.
- [ ] Inspect 1440, 1024, 390 px, keyboard/focus, loading/empty/error and no page overflow.
- [ ] Independent source/visual review, exact official build and fresh locked source release kit.
- [ ] Coordinate root as sole publisher; fresh baseline, NET accept, SITE accept, all-runtime final verification and live screenshot.
