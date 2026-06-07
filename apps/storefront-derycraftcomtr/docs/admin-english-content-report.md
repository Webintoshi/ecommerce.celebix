# DeryCraft.com English Content Admin Audit

This report lists content that should be reviewed in the admin/content sources after the storefront UI has been converted to English. No live database content was changed.

Verification note: this file is safe to touch for deployment pipeline checks because it does not affect storefront runtime behavior.

| Entity type | Field name | Current source | Admin managed? | English content needed? | Suggested English wording |
| --- | --- | --- | --- | --- | --- |
| product | name, description, shortDescription | Product records | Yes | Yes | Keep product names brand-safe; translate descriptions into concise English product benefits. |
| product | seoTitle, seoDescription, slug copy context | Product SEO fields | Yes | Yes | "Premium Leather [Product] | DeryCraft" and a short English benefit-led meta description. |
| product | variant name, option labels, stock-facing option text | Product variants/customization records | Yes | Yes | Use clear labels such as "Black", "Brown", "Personalized", "Standard". |
| category | name, description, seoTitle, seoDescription | Category records | Yes | Yes | "Leather Bags", "Leather Accessories", "Apple Watch Straps", depending on the actual category. |
| managed page | hakkimizda, iletisim, sss, policy page body and SEO | Managed content pages | Yes | Yes | Replace Turkish body content with English copy; keep the current brand tone and legal accuracy. |
| store setting | profile tagline, footer/about/contact summaries | Storefront profile/settings | Yes | Yes | "Premium handmade leather accessories crafted for everyday use." |
| homepage setting | hero banners, promo banners, marquee, announcement, testimonials | Storefront settings | Yes | Yes | Translate banner titles, subtitles, CTA labels and trust messages to English. |
| shipping | shipping method names, delivery estimates, free shipping notes | Shipping settings/rates | Yes | Yes | "Standard Shipping", "Ships in 1-3 business days", "Free shipping over ...". |
| payment | bank transfer/payment method label and instructions | Payment/store settings | Yes | Yes | "Bank Transfer", "Please include your order number in the transfer note." |
| discount/campaign | coupon names, campaign labels, lucky wheel prize text | Discount and campaign records | Yes | Yes | "10% off your first order", "Free shipping coupon", "Welcome offer". |
| customization | field label, placeholder, help text, option labels | Product customization schema | Yes | Yes | "Enter initials", "Choose thread color", "Upload reference image". |
| blog/SEO content | article titles, excerpts, category names, MDX SEO hub content | Blog/content files or admin content | Mixed | Yes | Translate or replace Turkish SEO articles if these routes stay public on derycraft.com. |
| legacy/internal UI | admin-like product/API error text and SEO prompt text | Storefront code internals | No | Optional | Keep internal-only text if routes are not customer-facing; translate if surfaced publicly. |

Recommended admin pass:

1. Update product, category and page records first because these are the most visible storefront surfaces.
2. Update homepage settings next: hero, announcement, marquee, promo banners, testimonials and footer-managed links.
3. Review checkout-facing operational content: shipping, payment instructions, coupons and customization schemas.
4. Audit public blog/SEO routes and either translate their content or unpublish routes that should not be visible on the English storefront.
