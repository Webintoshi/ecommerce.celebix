# Section homepage builder and direct Apply

User-approved specification, September 30, 2026. Base: `61cc2b8cef4d65ca0446b39e47e4d593d119fe5f`, the observed live Customer Panel source. The main checkout was an older divergent line, so this work starts from the actual live source.

## Required behavior

- Homepage insertion gaps at start, between sections and before footer. Insert at the chosen index; stable section IDs; repeat any type; duplicate, hide and remove.
- Centered section popup with Content/Appearance tabs, Apply/Cancel. No nested popup. Mobile fullscreen. Order popup supports drag and keyboard arrows with Apply/Cancel.
- Existing section library plus repeatable banner: single, slider, stacked. Per-slide desktop/mobile image, text and link; desktop fallback. Slider controls, optional 5-second autoplay paused on interaction.
- Product lists support latest, sale, category and ordered manual IDs. Category sections resolve their own categories rather than one global showcase.
- Per-section theme/light/dark/brand background, contained/full width, small/normal/large vertical spacing. Undefined style preserves legacy appearance.
- Remove 12-section, four-product-row and singleton restrictions. Preserve resource deduplication, lazy images and preview/live parity.
- All design settings use Apply directly to live and Cancel to discard local changes. No draft/autosave/publish workflow or UI.
- Editable baseline is published configuration, never the old saved draft. GET `/api/storefront-design/editor`; POST `/api/storefront-design/apply` body `{expectedPublishedVersion,design}`, Idempotency-Key. One authorized, version-checked SQL transaction records config/publication/operation/event. Invalidate settings after commit. Preserve inputs after failures; retry same key; never silently overwrite conflicts.
- Design document v5, composition v4. Read legacy versions; retain old image/reference origins and visible banner presentation. Header/footer are boundary surfaces. Product page structural redesign is a later task.

## Shared implementation interfaces

- V5 keeps inert `hero` for compatibility, disabled; ordered composition v4 owns banners. `normalizeStorefrontDesignDocumentV5` maps enabled legacy fixed hero to one first banner, and legacy composition heroes to independent banners. New editable API returns normalized V5.
- `HomepageSectionStyle`: `{background:theme|light|dark|brand,width:contained|full,spacing:small|normal|large}`; optional on sections. Use 16/32/48 px desktop spacing and 8/16/24 mobile, with default wrappers unchanged when absent.
- Banner `kind:"banner"`, `sectionId`, `enabled`, `layout:"single"|"slider"|"stacked"`, `autoplay:boolean`, `presentation:"image_only"|"overlay"`, `slides`. Slide: stable `slideId`, `enabled`, `headline`, `body`, `desktopImage`, `mobileImage`, `destination`, optional legacy eyebrow/product hotspot. Preserve media references as `{kind:"media",mediaId}` or `{kind:"asset",assetId}`; retained legacy HTTPS only if already in the current persisted legacy record. Destination: existing resource references or validated internal `{kind:"path",path}`.
- V4 manual product row uses `source:"manual"`, ordered `productIds`, existing limit 4/8/12. No new section-count cap; maintain request-size protections.
- `StorefrontDesignEditorWorkspace`: `{schemaVersion:1,publishedVersion,publishedAt,design,store,media,destinations}` with editable live `design`. `StorefrontDesignApplyMutation`: `{publishedVersion,publishedAt,design,published}`.
- Root owns direct-Apply HTTP/repository/runtime/client and SQL179. Contract implementer owns shared contract/types/normalizers/SQL178. Renderer implementer owns public projections/shared storefront/preview resources. UI implementer owns design components/CSS/command models. Each agent stages only its owned files, no commits/push/live mutations; root integrates commits.

## Verification and rollout

Behavioral tests: two independent collections with inserted banner; all banner layouts; manual ordering; duplicate/hide/delete/order; Apply vs Cancel; failure/retry/idempotency/version conflict/tenant denial; legacy image and hero parity; 50 mixed sections. Responsive 1440/1024/390, focus/keyboard, console/network. SQL must run on an isolated database copy, including assertions and rollback. Deploy compatible DB/readers/shared storefront before admin writers; verify all current panel domains, then controlled Güzide apply/restore acceptance. Preserve independent concurrent releases and current payment/runtime scopes.
