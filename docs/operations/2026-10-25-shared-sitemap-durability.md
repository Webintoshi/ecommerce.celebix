# Shared sitemap durability

## Observations

At investigation time Ezmeo's canonical sitemap and both shards returned valid
XML with HTTP200. All eight active products appeared; its archived product did
not. All 14 listed destinations returned HTTP200, self-canonical HTTPS URLs and
index/follow metadata. The reported opening failure was not reproduced during
these checks. Chrome's “no style information” XML message is not a parse error.

Two shared weaknesses were established from source and regression tests:

- Sitemap GET handlers unnecessarily resolved theme, campaign, WhatsApp order,
  tracking and marketing presentation before reading sitemap data. Unrelated
  design or commerce failures could therefore prevent XML from being served.
- The index advertised nested `/sitemaps/{kind}/{page}` documents containing
  URLs outside that directory. Google recommends placing sitemap documents at
  the site root so their scope covers the whole site without depending on
  Search Console submission.

Reference: https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap

## Repair

The index advertises `/sitemap-products-0.xml` and
`/sitemap-content-0.xml` style root files. Existing nested addresses redirect
with HTTP308 to their strict same-origin root equivalent. The existing root
`[key]` route dispatches only validated sitemap names; IndexNow key handling
remains separate and retains its existing checks.

Sitemap requests use trusted host authority, the public store resolver, public
SEO settings and sitemap readers. They do not load page presentation. Unknown
hosts, noncanonical aliases, noindex settings and unavailable authority remain
closed. Upstream unavailability is not disguised as a successful empty map.
Database queries, 1,000-entry shard boundaries, persisted last-modified dates,
product publication rules and customer/checkout flows are unchanged.

## Verification

The focused sitemap/robots/IndexNow suite passes 17 checks, including actual
route adapters, unrelated presentation failures, invalid filenames, trusted
proxy authority, canonical/SEO restrictions, legacy redirects and unavailable
reader outcomes. Storefront type checking passes.

The wider storefront suite reports 984/994 passing. Its ten failures reproduce
with the same names and locations on checkpoint `a2f76f4e7` under the same
generated payment profile: `ProductPageReviewForm.behavior` (server `act`),
`ProductQuickView` (stale source assertion), six
`SelectedProductDetailSummary.behavior` cases (server `createContext`),
payment-adapters `default` (absent test authority), and `storefront-app`
(pre-existing Akbank import allowlist edge). These are not new sitemap
regressions; the baseline comparison is retained in the private test evidence.

Publish the same reviewed candidate to storefront NET and then SITE; preserve
the installed native277 catalogue, all payment authority profiles and the four
owner/panel runtimes. Compare live index/shard contents against the initial six
store snapshot. Do not enable indexing for stores whose settings currently
disable it, and do not claim that a valid sitemap guarantees Google indexing.
