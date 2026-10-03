# Lilyum Flora local browser fixture

Run `npm run dev` from this folder after the monorepo dependencies are available. Preview: http://127.0.0.1:8142/ . Type validation: `npm run typecheck`.

This fixture renders the actual Lilyum homepage, shared frame, header, footer, favorite provider and cart provider. `app/data.ts` is a QA-only snapshot of publicly observed Lilyum logo, navigation, media, product titles/prices and typography. Production consumes the existing store campaign projection and has no fixture product data dependency.

The API routes provide a schema-valid empty cart, anonymous session and favorite resolution for the snapshot products. Variants are synthetic QA values. This fixture does not create orders, take payments, send email or change published admin content. Catalog, product detail, favorites and checkout page routes are outside its scope and remain implemented in the production shared storefront.

Related source: `apps/storefront-shared/themes/lilyum/`. The accepted visual and asset specification live under `docs/design/lilyum-flora/`. Browser evidence is kept outside the repository.
