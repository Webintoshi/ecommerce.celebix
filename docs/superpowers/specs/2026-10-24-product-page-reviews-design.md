# Product-page review collection

## Intent
Let stores accept customer reviews directly beneath product pages, controlled from the shared Products → Reviews page. The user directly requested implementation and has opted out of additional approval rounds.

## Decisions
- Add an independent, initially disabled setting for the product-page writing form. Preserve the existing approved-review presentation and automatic email invitation setting.
- Existing WhatsApp customer sign-in authorizes submissions; anonymous visitors receive a sign-in link returning to the product. Browser-supplied customer/store IDs and purchase verification have no authority.
- Reuse product_reviews and existing pending → approve/reject/archive/reply workflow. General account reviews do not claim a verified purchase; existing invitation reviews retain their purchase-backed badge.
- Use a separate additive native274 settings/submission contract, avoiding changes to closed-shape invitation DTOs and historical SQL.
- One direct review per store/account/product, durable account quotas, same-origin HTTP checks, bounded input, native active-product/session checks and operation replay protection. Disabling the form must also deny new writes.
- Render one shared form for every current theme. Read availability once per product mount; no polling or background worker.

## Approaches
Reusing the invitation-email flag would couple unrelated behavior. Changing the old invitation-token endpoint would weaken its capability boundary. A separate authenticated product-page boundary reuses moderation while keeping both existing flows compatible.

## Function inventory
Keep the review list, search/status filters, merchant replies, moderation, verification badges, invitation history, eligible orders and email settings. Add only the independent setting and product-page writing form.

## Acceptance
Disabled form is absent and native writes are denied. Guests get sign-in; valid customers can submit a rating/name/body and optional title. Submission remains pending, survives safe retry and does not duplicate. Expired/foreign sessions, inactive products, forged identity fields and conflicting operations are rejected. All themes receive the form; desktop/mobile layouts remain usable. Both shared panels and storefronts are published and their running source verified.
