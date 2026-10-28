# Toshi product formatting implementation plan

> **For agentic workers:** Execute the bounded tasks in this chat; root owns integration and release.

**Goal:** Keep the user's approved Turkish product-writing style, emphasize natural product keywords, and use H2/H3 only when useful.

**Architecture:** The model writes a small selected-field Markdown envelope. A server converter creates the existing typed draft. Bold is a server-issued alias of a complete known fact, preserving its value, unit and scope; native and panel renderers add the same escaped strong wrapper. Historical drafts retain their rendering.

**Tech stack:** TypeScript, shared Customer Panel, PostgreSQL16, existing DeepSeek Flash quality profile.

**Spec:** The user's approved prompt and request in this chat: natural keywords in bold; correct heading hierarchy; no unnecessary sections in short copy.

## Constraints and review focus

- Public API/AST shape, prices, reserve/debit/replay semantics and authentication remain unchanged.
- Alias evidence must never authorize substrings, new attributes or another variant's values.
- Preserve whole existing assertions once and in order; retain selected-field and SEO60/160 limits.
- No executable HTML, links, images or code in the writer envelope.
- Exact panel/native render parity must keep unchanged Apply→Save classified as AI.

## Tasks

- [x] Render-only red/green tests: escaped full-fact bold aliases and all unchanged legacy nodes.
- [x] Converter/service red/green tests: approved writing brief, simple selected-field wire, bounded Markdown, source slots, scope isolation, correction/replay and charge behavior.
- [x] Native red/green tests: same bold output/digest, unchanged historical output, idempotent up/down, same privileges and no other function changes.
- [x] One real Flash generation reviewed for writing and formatting; do not save the QA preview to a customer's product.
- [x] Targeted checks and typecheck; refresh the source-bound signup proof if SQL changes make it stale.
- [ ] Commit, exact-candidate admission check, apply compatible native renderer, then publish panels NET→SITE.
- [ ] Verify running commits, live Ezmeo preview, console, and reimburse any platform QA credits.
