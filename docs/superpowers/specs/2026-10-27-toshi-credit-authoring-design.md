# Toshi shared product content and credits

Approved by the user in this conversation on 2026-10-27 after toolbar preview, prompt, credit pricing and image-alt workflow discussion. Implement and publish the shared experience, then the user will test through Ezmeo. Root is release owner; preserve all existing checkout and signup compatibility.

## Experience

- Orange sparkle action immediately before description editor undo/redo. Empty content: `Yapay Zeka ile Üret`; meaningful existing content: `Yapay Zeka ile Optimize Et`.
- No action/tone/length/note choices. Automatic creation or optimization per selected output. Keep current draft, tenant binding, provenance and undo safeguards.
- Select description (7 credits), SEO title (1), SEO description (2), image alt text (1 per selected image). Unselected content is neither generated, overwritten nor charged. Show total before generation; opening or applying a result does not charge.
- Generated SEO title <=60 and description <=160 Unicode characters, including any brand/separators. These are Celebix limits, not official Google limits. Preserve old stored metadata and old order data. Rewrite overlong new output meaningfully, never cut a measurement/model code. Invalid/empty output costs no customer credits.
- Product facts and exact variant scope remain authoritative. Natural Turkish, useful short introduction and headings/lists as information permits. No invented product, packaging, health, certification, delivery or sales claims. No padding to a word count. Description maximum1000 words.
- Image alt generation uses authenticated small image bytes plus product context and actual image IDs. Maximum4 images/request, thumbnails <=512px and128KiB each. No arbitrary server-side URL fetch. Do not invent unseen angles or hidden material/ingredient facts. Same meaningful image can have same alternative text. Existing alt text protected unless explicitly selected. Preview/apply uses stable image identity and safe current draft/version checks.

## Credit and provider contract

- One central server-only DeepSeek key kept only in runtime configuration, never persisted into merchant BYOK records. Native provenance uses retained merchant credentials or non-API placeholders; metered authority seals the runtime key only transiently. Legacy chat/resource dispatch rejects platform keys/placeholders and otherwise preserves existing merchant-owned keys. Fixed provider endpoint/model `deepseek-flash`, nonthinking mode. No customer API key entry. Preserve credential encryption and existing native generation provenance.
- Durable per-store wallet. Reserve before provider dispatch, finalize only validated completed output, release on failure/unknown. Stable operation ID+request fingerprint prevents duplicate provider calls/debits; ambiguous results never trigger automatic redispatch.
- Price offers excluding VAT: toshi-500 (500credits/249TRY), toshi-2500 (2500/999), toshi-10000 (10000/2999), toshi-50000 (50000/12499). One-time explicit purchases, no recurring or automatic charge. Existing package/tool rights unchanged. Provider-verified iyzico settlement grants the correct store credits once, atomically.
- No automatic grants to all tenants. Audited explicit acceptance grant may be made to Ezmeo to permit user testing; no simulated paid receipt.
- GET `/api/toshi/credits` returns wallet, offers and fixed prices. Product generation keeps `/api/content-ai/generations` request with automatic action. Image POST `/api/content-ai/image-alts` accepts draftId/productId/context and1–4 `{id,dataUrl,variantLabel?}` entries; returns `{results:[{id,altText}],failedIds,chargedCredits,wallet}`.

## Verification and publication

Focused tests cover charge math, insufficient/concurrent balances, replay/cross-store rejection, partial image success, malformed image/provider output, SEO boundaries, unselected field preservation, edit/create and draft staleness. Native PostgreSQL tests prove wallet and payment fulfillment. Build affected owner/customer panel and main checkout compatibility; run exact-source signup release guard. Publish schema support first, owner then shared panels NET→SITE. Verify live source and Ezmeo UI before completion claim. Never perform a real card payment for testing.
