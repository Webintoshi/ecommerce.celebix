# Restock tool — Mira presentation revision

## Scope and function inventory

Primary task: enable and configure one-time selected-variant stock emails, then inspect notification delivery status.

- Existing `schemaVersion`, `enabled`, `title` and `buttonLabel` configuration is preserved.
- Existing active-record selection, version checks, save operation identity and same-content retry remain unchanged.
- Four counters, masked recent recipients, product/variant names, statuses and uncertain-delivery explanation remain visible. Recent request time is now displayed.
- Loading/error retry, independent stats refresh, read-only inspection and non-submitting product preview are preserved.
- An open editor uses the approved contact-tool visual system: shared controls, neutral open layout, flat box/bell/envelope artwork and desktop/mobile preview.
- Cancel/Escape ask before discarding edits. Focus returns to the originating control; page exit protection includes pending writes and explicit editor reloads, without blocking initial background reads.
- The parent hides the contact tool's overview/loading/errors while editing the stock tool, without discarding its loaded state.
- The original WhatsApp icon is unchanged. Its attribution is moved from the working page to Ayarlar → Görsel kaynakları, retaining the author/source link.

Backend/API/SQL/infrastructure changes for this revision: **NONE**.

## Verification

- Contact behavior: 24/24 passed, including independently loaded stock editing during contact read failure/loading.
- Restock behavior: 8/8 passed; dirty cancel, Escape/focus, beforeunload, CAS, retry identity, conflict reload failure, read-only preview, independent stats retry, hanging-read navigation and duplicate-write guards.
- Local-only fixture transport: 5/5 passed; stock saves and statistics are synthetic, same-origin, fail closed and isolated from contact records.
- Customer panel production build: passed. Sequential final typecheck: passed. An initial parallel typecheck raced generated Next.js files; the final sequential run resolves that generated-file race.
- Browser: 1440, 1024 and 390 px editor and overview layouts checked; document horizontal overflow was zero. Mobile editable fields use 16 px type; tool actions have 44 px minimum height.
- Browser: dirty Escape/continue/discard preserves input and restores focus. Read-only controls cannot save; preview switches remain usable and submission stays disabled. A synthetic save failure preserves title and shows retry feedback.
- Working page contains no Flaticon credit text. The author link is accessible in the dedicated credits disclosure in the settings overview.
- A fresh browser tab reports no console warnings/errors. During development, CSS hot replacement briefly produced an HMR error; a full reload resolved it. Screenshots were captured after reloading the updated styles.
- Atlas independent source/visual review: PASS, 32/32 behavior tests independently rerun. Two concrete findings (unrelated contact feedback and initial-read navigation blocking) were fixed and regression-tested.

Screenshots in [evidence/restock-mira](evidence/restock-mira/): overview/editor 1440, editor 1024, overview/editor 390. These use synthetic local fixture data, not customer notification records.

## Delivery state

Published to both shared customer panel applications on **2026-10-04 (Europe/Istanbul)**.

- Exact source: `6119aa871fc05d9b4ff9990c8ce22fa90d86c52e`, release branch `codex/store-engagement-tools`; previous panel source `29f2f48991ca5f1de2fbc95e166d2dfb79a04a16` is preserved in its ancestry.
- NET deployment: `s8u3slf09hyyzwuprzyfnbpv`, finished. SITE deployment: `i38sec4j9oktu5fe61joul32`, finished. NET exact runtime and cohort passed before SITE was queued.
- Final guarded verification passed for both application pins, SOURCE_COMMIT, running images, official payment artifacts/compiled authorities, 362 runtime source files, 29 source-only files, 34 client tokens and all four same-chunk feature groups. Global deployment queue is idle.
- SQL198 six functions, SQL200/201/208 46 financial functions and ACLs, enabled credit gate v2, payment configuration, encrypted settings and preview rows remain exact.
- A concurrent storefront navigation rollout stopped the initial snapshot before any panel pin or queue action. Its UI-only source delta was independently reviewed; a new read-only witness was bound to `codex/storefront-navigation-scroll` / `5bed7ebf0230ae265ec4685d637d252da47eeca1`. Both storefront runtimes passed before the fresh snapshot. No storefront application was modified by this release.
- Atlas independently approved the candidate, immutable payment proof, source cohort, SQL208 source-derived verification and the narrow storefront witness rebinding. Pure release guards: 202/202 passed.
- Public checks passed for Güzide, Butik Siora and Alpler: health HTTP 200 with exact tenant/hostname resolution; the original WhatsApp image is unchanged and serves HTTP 200.
- Authenticated live Siora browser check: attribution absent from the working screen; new flat stock illustration and open editor visible; all four counters load; desktop/mobile preview works and cannot submit; Cancel restores focus. Horizontal overflow 0; console warnings/errors 0. No merchant settings were saved and no stock emails or customer requests were generated.

Actual live screenshots: [overview](evidence/restock-mira/live-overview-siora.png), [editor](evidence/restock-mira/live-editor-siora.png), [mobile preview](evidence/restock-mira/live-mobile-preview-siora.png).
