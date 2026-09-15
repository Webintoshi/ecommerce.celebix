# Design final implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Preserve missing preview section identity, verify the narrow candidate, and perform the authorized Panel-only staging acceptance.

**Architecture:** Keep current projection and shared presenters unchanged. Select the heading fallback using explicit projected-content availability, not JSX object nullability; retain partial content and resource messages.

**Tech Stack:** React/Next.js, TypeScript, node:test, existing Coolify release tooling.

**Spec:** `/Users/Celebix/.codex/attachments/230b7b9b-d9a6-4f8a-803d-080b20659742/pasted-text.txt`

## Global Constraints

- Starting head `dd46590a3e7772ccb1839c6accff0c60ca1048a2`; branch `codex/mira-design-settings-fix`; PR79 draft/unmerged.
- Only heading fix and related test/QA changes. No new API, SQL/grants, auth, DNS, customer mutations or fabricated products/comments.
- Only `celebix-panel-staging-auth01` may be manually deployed after fresh rollback/queue/hooks/payment prerequisites. Auto Deploy/Preview OFF. Preserve both admin hostnames.
- Testimonials remain unavailable and A03 PARTIAL. Synthetic URL resolution is not loaded media evidence.

## Function inventory and task

Primary user task: inspect current draft without losing identity of unresolved sections. Existing canvas contains ordered homepage sections, product-detail example, footer, surface buttons and renderer shell. Navigation is inert inside resolved preview. No search/pagination or bulk actions. Loading/empty/missing/unavailable states, modal entry, device controls, typography and all current actions remain unchanged. Settings/read-only preview pattern; existing CSS/tokens reused.

### Task 1: Heading regression and minimal correction

**Files:** `apps/customer-panel/components/settings/design/VisualStorefrontCanvas.tsx` and `VisualStorefrontCanvas.behavior.test.ts` in the same directory.

**Interfaces:** Existing `PublicStarterHomeSection`, projection rows and section IDs; no public interface changes.

- [x] Extend real SSR missing-category regression with `assert.match(markup, /EKSİK KATEGORİLER/)`; run the behavior test with Node transform-types and observe assertion failure.
- [x] Test resolved empty product rows, unavailable testimonials and ordered multiple rows so fallback preserves headings/IDs without fabricated cards. Keep ready/partial content present.
- [x] Replace JSX null-coalescing with explicit availability matching presenter inputs: hero slides, category items, available product row items, campaign panels, value/testimonial items; brand story remains renderable without media. Use existing heading/type markup as fallback.
- [x] Run the behavior tests and relevant design/model/client group; Panel typecheck. Record RED/GREEN commands/results, self-review and commit only these two files.

### Controller verification and release

- [x] Independent spec/quality review of Task1; resolve Important/Critical before freezing candidate.
- [x] Final Panel package full suite/build/diff check. Reuse unchanged shared/PG/contracts evidence with original source identities; no gratuitous storefront build.
- [x] Inspect current PR/base and rollback/runtime/queue/trigger settings. Record actual image/SHA, deployment ID, domains, source pin, SOURCE_COMMIT and hooks without secrets.
- [x] Freeze RELEASE_SHA, push same draft PR after safeguards; check official payment generator/check and read-only migration readiness before any deployment.
- [x] Deploy only exact Panel candidate if all prerequisites pass. Verify actual running source/metadata/image and health200.
- [ ] Authenticated read-only Güzide acceptance at1440/1024/390; opening controls only, no autosave or publish; separate screenshots and real-image load evidence from fixture. Leave staging open and report remaining testimonial limit.
