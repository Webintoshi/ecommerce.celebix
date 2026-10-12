# Shared required-page footer release — 2026-10-12

## Scope and behavior

Shared storefront change for every current/future tenant, including Alpler,
Siora, Güzide, Lilyum, generic retail and legacy presentations. No tenant-specific
condition or merchant data change was introduced.

- Only the existing required identities `about`, `contact`, `blog` are read.
- Published pages with meaningful safely rendered content are added automatically.
- Current titles, adopted slugs and the Blog index `/blog` are used.
- Missing/draft/empty/malformed pages and individual reader failures are hidden.
- Existing custom destinations win; policies and checkout policy-only footer remain.
- Reads use the content default locale and trusted request hostname.
- Request-local React cache; no persistent content cache or browser polling.
- Additional normal-footer read budget: one locale read + three parallel page reads.
  Older optional readers perform zero additional reads; checkout performs zero.

## Source and verification

Footer commit `e5eaa1595c778740034b81c6527831bd6269c997`; deployed source
`1cba82c46b4d0bed10e22d6f1abd649e388575b7` also contains the necessary product
renderer boundary repair. Both previously live Deniz commits `cb4f28016` and
`41f508687` and current panel source `983a88a13` are ancestors.

- Footer behavior regression failed before implementation, then passed.
- 19 actual component checks cover six footer presentations plus policy-only checkout.
- 61 focused server checks passed; 78 related product/SEO/design/analytics checks passed.
- Two Next page-export regression checks were red, then green.
- Typecheck and fresh `.next` production build passed.
- Product renderer/metadata/import contents were moved byte-for-byte to sibling
  `render.tsx` files; four route entry points retain default and metadata exports.
- Six negative recovery release guards passed.

One additional pilot static test remains a pre-existing mismatch: it looks for
`media[0]` in `ProductCard.tsx`, although media rendering already lives in
`ProductCardContent`. Neither implementation was changed by this task. This is
not included in the passing counts above.

## Controlled publication

First NET attempt `c4bchhh3ww28yccdghcydest` for `e5eaa1595` failed the clean Next
page export check (`renderProductsPage`). Existing storefront containers continued
running. Failure was inspected; original intents/snapshots/receipts were retained.
A separately reviewed candidate and recovery release were used, with no automatic
retry or rollback. The similar product detail helper export was corrected too.

Successful order: NET acceptance, then SITE. Verified at 11:13 Türkiye time.

| Target | Deployment | Image and SOURCE |
| --- | --- | --- |
| Storefront NET | `pww5g8tb7e06j611pssqblwe` | `1cba82c46b4d0bed10e22d6f1abd649e388575b7` |
| Storefront SITE | `lo9x14d3tzdcbq9gaol4ymhh` | `1cba82c46b4d0bed10e22d6f1abd649e388575b7` |

Both owned deployments finished; global queue idle. Four owner/panel containers,
raw protected configuration, runtime environment and compiled payment/Google
authorities were preserved. Native 1770 functions, schema/roles and all seven
payment214 startup checks remained unchanged. No SQL migration, provider operation
or merchant record modification was performed.

## Real acceptance and limits

Both actual deployed renderers served Güzide, Alpler and Siora hostnames with 200
homepages. Güzide's published nonempty Hakkımızda was automatically linked to
`/pages/hakkimizda`; destination returned 200. All six existing policy destinations,
catalog navigation and Celebix signature remained present. Its empty published
Blog introduction and draft contact page produced no automatic link.

Alpler's about/contact/blog records were all empty drafts. They correctly remain
hidden and were not populated/published for testing. Siora drafts were hidden too.
All-three-positive coverage uses fixtures through actual shared theme components,
not a claim that all three merchant pages were published in production.

Public browser acceptance: Güzide desktop footer shows the automatic link; at
390px its Mağaza accordion reveals the link and clicking opens the actual
Hakkımızda heading. Alpler and Güzide mobile checks showed no horizontal overflow.
Temporary viewport and browser preview were cleaned up.

Screenshots: `/tmp/celebix-footer-20261012/guzide-footer-desktop.png` and
`guzide-footer-mobile.png`. Private operational receipts remain outside Git under
`.tmp/required-pages-footer-release` and
`.tmp/required-pages-footer-build-repair-release`, with remote counterparts in
restricted release directories. They contain protected configuration snapshots;
their contents are intentionally not copied here.
