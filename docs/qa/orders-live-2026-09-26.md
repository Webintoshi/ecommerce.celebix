# Approved orders workspace live release — 2026-09-26

Status: **PASS — live on both active shared Customer Panel applications**.

## Candidate and preserved features

- Candidate source: `b2b805ee987f173ce1cbe07bf49c7d406a994e11`, branch `codex/orders-approved-ui`.
- Approved orders implementation: `1e0a88d22885a8ede90b38198dd5736ec83b15c8`.
- Preserved incoming measurement release: `c55b88f8c6c4e1679bf58cf3d22ccbc0c160cac4`; categories160, numbering161, register157–159 and optional measurements162 remain present.
- The first release guard refused a changed source before any mutation when the independently authorized measurement rollout started. That source was merged without conflicts. Independent review proved that the final diff against c55 is byte-for-byte the approved orders diff against29afede4; all57 incoming measurement paths remain unchanged.
- Orders task changed no API/repository/SQL/auth/payment adapter behavior. No migration was applied or replayed by this release.

## Fresh candidate checks

- Initial approved source:57 focused tests passed; production build completed with compilation, TypeScript and90 static pages.
- Final merged candidate:72 orders/shipping/measurement UI tests passed, zero failures. Production build completed successfully, including TypeScript and90 static pages.
- Exact candidate source pushed normally to GitHub and verified with `git ls-remote`. Whitespace checks passed.
- Official PayTR binding functions and an independent SHA computation matched. Adapter source digest is unchanged; existing release bindings are updated for the new source without adding provider authority.
- Protected configuration snapshots saved at `/data/celebix-release-backups/orders-ui-preflight-20260926.json` and `/data/celebix-release-backups/orders-ui-preflight-c55-20260926.json`.

## Live evidence

| Application | Deployment | Finished (UTC) | Running container |
| --- | --- | --- | --- |
| Güzide / `.site` / custom domains | `n10lauw2pw2fzmxvn2fagi91` | 16:00:17 | `48c5ad4da2ae` |
| Siora / `.net` | `sdbjrb9h0lw1nco4ftoey0vc` | 16:07:08 | `24b0992a1789` |

- Both terminal deployment records, running image tags and runtime `SOURCE_COMMIT` match candidate `b2b805ee987f173ce1cbe07bf49c7d406a994e11`.
- Running UI and preserved feature file hashes match the local candidate. Compiled orders list/detail, register and payment-links routes are present. Generated payment metadata matches the candidate and the official binding calculations.
- Configuration comparison passed: existing payment approval modes, build/runtime flags, all unrelated environment attributes, build hooks and disabled auto/preview deployment settings remain preserved. Both queues are drained.
- HTTP200 / `status: ok` verified on `butik-siora.admin.saas-staging.celebix.net`, `guzide-kuyumcu-4.admin.saas-staging.celebix.site`, `admin.guzidekuyumcu.com` and `admin.guzidekuyumcu.com.tr`; each maps to its expected store. The selected health projection does not verify Redis dependency status.
- Authenticated Güzide UI: desktop list and order detail visually inspected; 17 active orders loaded. Columns dialog closes with Escape and returns focus. Failed-payment filter selects3 of17 orders; clearing restores the list. Manual shipping dialog opens, closes with Escape and returns focus without submitting.
- Güzide list/detail at390px: document width390, no horizontal page overflow, semantic headings remain visually hidden. Mobile detail screenshot inspected with product totals, progress and primary action intact.
- Authenticated Siora UI: current empty state, search/status/filter controls and disabled empty CSV export inspected on desktop and390px mobile; no horizontal page overflow. No order exists to open a Siora detail; its detail implementation is the same verified runtime source as Güzide.
- No merchant/order/provider mutation was submitted by browser smoke checks. Temporary viewport override reset and agent-created QA tabs closed.
- No disk cleanup performed. After both builds, server filesystem headroom is8,855,207,936 bytes (95% used); the next build should check capacity.

Sanitized live evidence: [orders-live-evidence.json](evidence/orders-approved-ui/orders-live-evidence.json). Release helper configuration snapshots remain protected on the server; credential-bearing snapshots are not committed.
