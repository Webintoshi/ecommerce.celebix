# A03 independent review

## Initial application review: 3780c449

Reviewer: independent read-only review seat, not implementation author. Verdict: **Needs fixes**; no Critical findings. The reviewer examined the provided immutable diff and named authority/contract risks, without running a redundant full suite.

Important findings:

1. `use-preview-resources.ts:14-31`: permanent StrictMode disposal and uncancelled A→B-pending→A transition.
2. `storefront-design-preview-model.ts:13` / hook: no distinct loading state.
3. `VisualStorefrontCanvas.tsx:190-216`: shared composer filters missing category before the Panel can display its status.
4. `VisualStorefrontCanvas.tsx:203-216`: bubbling prevention is too late for nested NextLink handlers; preview navigation must be inert.
5. `storefront-design-preview-ui/client.ts:20,38`: valid zero-price hotspot rejected by positive-only integer validation.
6. `loader-core.ts:113-188` / client: full PublicProduct transport includes unused descriptions, variants, attributes and possible public review fields; needs a bounded card DTO to meet minimal transport and avoid exhausting response bounds.

Minor: optional-runtime isolation is tested through source text rather than a behavioral injected failure.

Strengths: canonical tenant identity check precedes dependent reads; existing read-only repositories and media permissions are retained; source queries are bounded/deduplicated with limit-before-availability semantics; session-only HTTP authority, strict input and no-store response; pure shared presentation avoids commerce/server-footer dependencies.

Pending at this review: implementation report, final correction source, PG/fixture delta review, final source-bound tests/builds, responsive screenshots and re-review. No final acceptance is implied by this initial review.

## Final independent integrated review: d5df7e5aec43bff28ce6d12a3c0a91f1d3ab9b91

Fresh read-only reviewer `a03_final_review` reviewed both immutable diff packages and the implementation report after the previous review seat was lost during session restart. Verdict: **Approved for bounded, explicitly partial A03 delivery. No remaining Critical/Important finding.** All six preceding findings were corrected. Tenant authority and existing repository/read-only protections remain intact. No files or external state changed in review.

Minor retained finding: `VisualStorefrontCanvas.tsx:217-218` uses JSX in `content ?? fallback`; the JSX object is non-null even if the child renders null. Missing section status/order survives, but its intended identifying heading/type fallback does not render. An explicit availability predicate and visible-heading assertion would address it.

Review is not a live or full-home parity certificate. PG only compares first product title/media, exact loader snapshot and unchanged design workspace. CDN byte delivery and testimonials remain unproven/unavailable. Final test/build/browser evidence is controller-owned in the report, not inferred from review.
