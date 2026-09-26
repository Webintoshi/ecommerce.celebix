# Categories live release — 2026-09-26

## Released source

- Exact live source: `3e6e91862b5739e72c90d44e5cc715e6e8af0fb0`, branch `codex/categories-live`.
- Categories `fe91691a` was cherry-picked as `c94f6980` onto the then-current live source `d56a01df675a79f99b03440baea7553dc20926ab`.
- The release preserves the register, cashier, inventory and aggregate-product-stock features from that live source. No payment adapter behavior files changed.
- Category migration was renamed to **SQL160** because live SQL157/158/159 already belong to the register, cashier and stock summary. SQL161 is reserved for the independently coordinated numbering release.
- SQL160 uses a dedicated immutable order-ledger guard, with restricted execution and runtime assertions; it is independent of the migration144 deletion guard.
- The canonical `CatalogDashboardSummary` type fixes an existing literal-zero test fixture error; application behavior is unchanged.

## Validation before release

- Customer Panel production build: exit0; compilation, TypeScript, all90 static pages and build traces completed.
- Customer Panel typecheck: exit0.
- Focused UI/client/runtime tests:137 passed. Shared contracts/data tests:136 passed. SQL static tests:4 passed; disposable PostgreSQL scenarios:15 passed.
- Fresh protected full backup: `/data/celebix-release-backups/categories_20260926_132955.dump`, mode0600, 9,576,295 bytes, SHA256 `e20dd2d8ec23b6c6f46433f419416bb4b8ad48ba34d77a64101101b50f83f076`.
- Full restore into isolated `celebix_category_rehearsal_20260926_132955` succeeded. Up160, assertions160/157/158/159, down160 and reapply160 succeeded against the restored real predecessor. Merchant record counts and commerce function definitions were unchanged.

## Database release

- Verified target `celebix_saas_staging_auth01`, PostgreSQL16, `isolated_staging`, writable primary and migration-owner authority.
- Up160 applied once after checksum verification; category160/register157/cashier158/stock159 assertions passed. Live commerce function fingerprint was unchanged across160.
- SQL160 up SHA256: `c01e776498139931a80feaebc69447456a478aa1c5abfe56eb87671091e8bccd`.
- Assertions SHA256: `31afb23acd5de8ee11e5dab5c2dfaedea3895592957d8dce8b50fcfab4b9ab4b`.
- Down SHA256: `227c454b70d98d1c43979304f065c25ee2f9b935f39a468a877032d7320022ec`.
- The up migration is not idempotent. Recheck schema and run assertions after a committed application; never blindly replay it. Down refuses once image associations or order-ledger data exist. Preserve ledger/data and prefer a compatible forward fix.

## Deployment and live verification

| Shared application | Deployment | Result |
| --- | --- | --- |
| Güzide `yk1h6d97z7ex0h74ok3zrj5c` | `kergy68hfclw09bo2cik9f04` | finished, 13:41:37UTC |
| Siora `e4xe74cmii7jucbkyor0o412` | `zf4xq1eq18u71fe02qkzwac4` | finished, 13:46:11UTC |

- All active shared Customer Panel applications were enumerated before release; these are the two matching applications.
- Both running image tags, runtime `SOURCE_COMMIT` and generated adapter metadata match the exact release source. Each application has one running container; both old containers were removed.
- Only the existing source/digest bindings were updated for the release. Approval modes, runtime/build flags, other environment attributes, deployment hooks and disabled automatic/preview deployment flags were preserved. No Iyzico approval authority was added.
- Four tenant health endpoints returned200/`ok`, expected host/store mapping and Redis`ready`: Siora staging, Güzide staging, `admin.guzidekuyumcu.com`, and `.com.tr`.
- Authenticated Chrome checks on Siora and Güzide passed: list load, neutral visual layout, hidden semantic page title, editor/media controls, open/close and focus return. Siora's reorder controls/cancel and category-only image library passed. Save remained disabled for unchanged drafts; editor footer remained visible, page horizontal overflow was zero and console errors were empty.
- Live smoke checks made no category/media/order writes. Persistence, authority, failed retries and concurrent reordering were covered by the focused tests and PostgreSQL rehearsal.
- Protected coordination handoff: `/tmp/celebix-category-release-handoff.json`. Future releases must merge this exact source and preserve SQL160; the original pre-register feature source must not be deployed over the current release.
