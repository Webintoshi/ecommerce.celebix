# Lucky Wheel Task 2 — Customer Panel implementation report

Date: 2026-10-10. Worktree: `/Users/Celebix/.codex/worktrees/popup-delete/Saas-Celebix`. Branch: `codex/lucky-wheel-design`. Implementer: `wheel_admin`.

## Scoped commits

- `932161588`: dedicated coupon-backed Lucky Wheel studio, HTTP/UI adapters, runtime, routes, managed reward visibility, behavior tests.
- `de28675865d630713cd9b83c6dc3833975f734b7`: reload recovery for inline source creation and private code-triggered source creation.
- Base for preexisting test evidence: `e59336cd1`.

Only owned Customer Panel files were staged. Foundation packages/SQL, storefront, root browser fixtures, and the preexisting `apps/customer-panel/node_modules` symlink were excluded. No deployment or production writes were performed by this worker. No new product dependencies.

## Delivered behavior

- List, search, original status/archive filter, history, new and edit routes use `renderLuckyWheelPage` and the dedicated authenticated API. Old generic wheels expose their preserved config read-only; text prizes are never converted into coupons.
- Save directly applies the selected open/closed state. Every linked slice uses the real current promotion rule and generated display label. Four to eight slices, positive integer basis-point weights totaling 10000, optional issuance limits, configurable one-design colors, contact-first settings, unchecked independent marketing permission, devices/paths/scroll/date controls are present.
- Delete explains that issued coupons/history remain; revoke is a separate action reporting exact revoked/held counts. Unknown save/delete/revoke replies preserve store-scoped full payload and operation identity through reload. Version conflict refresh retains edits.
- The picker uses existing authenticated promotion list/detail/apply APIs. Inline source creation is code-triggered with `LW-SOURCE-` plus unpredictable 32 uppercase hexadecimal characters; it cannot activate an automatic storewide basket discount. The merchant sees that the source uses a code and that the wheel issues separate coupons.
- Inline creation persists the validated canonical source name/rule and fixed operation key before the request. Reopening after reload restores the immutable original form. Changed uncertain intent is blocked; retry uses byte-identical body/key. Definitive first-attempt authorization/input errors release the fence while retaining fields. An auth rejection during verification retains an earlier possibly committed operation. Storage failure blocks writes before contacting the server.
- Discount list and editor use the separate authenticated paginated managed-source index, including historical revisions and deleted campaigns. All generated reward rows show “Şans Çarkı”, campaign link, issued/used counts and deletion status, and remain read-only. Index failure locks ordinary mutations with a retry. No V1 promotion contract was changed.
- Preview uses the same clockwise equal-wedge geometry as storefront, automatic contrasting text/background ink, and three-decimal SVG coordinates to avoid Node/Chrome hydration differences. The preview spins locally without issuance, contact collection, or network writes.

## Authority and integration contract

The runtime facade binds all six required methods: `list`, `save`, `deleteCampaign`, `history`, `revokeCoupons`, `managedPromotions`. Runtime tests explicitly exercise binding and missing-method rejection. The default Postgres runtime registers the foundation repository; successful writes invalidate the existing promotions cache namespace.

HTTP handlers reuse catalog authorization/origin/body checks, current store/membership/entitlement and typed repository authority. Reads require `promotions.read`; save requires `promotions.manage_draft` plus `promotions.publish` when enabled; delete requires `promotions.archive`; revoke requires `promotions.publish`. Configuration, CAS version, operation key, bounded response bodies and server receipts are validated. Cache policy is no-store.

Exact foundation handshake consumed: typed campaign status `active|paused|archived`, nullable native/legacy config, mandatory `legacyConfig`, `managedPromotionId` and `used` per prize, all six repository methods, `actorLabel` history, strict managed index parser with opaque keyset cursor. Each reader parses the shared contract.

Managed-source pagination is bounded to 50 pages of 200; cycles, duplicate IDs, incomplete bounded traversal and malformed responses fail closed. Source semantics WEB map to the actual evaluator channel `storefront`. Native reward snapshots replace the source trigger with a generated managed trigger; foundation confirmed that changing inline sources to private codes needs no shared contract delta.

## Verification and evidence

RED evidence before implementation:

- `admin-red.log`: HTTP/client missing implementations.
- `admin-ui-red.log`: missing dedicated UI.
- `admin-managed-red.log`: missing managed-source adapter.
- `admin-managed-ui-red.log`: new historical/deleted read-only behavior tests against isolated base components fail exactly two cases.
- `admin-source-recovery-red.log`: source recovery module absent.
- `admin-source-recovery-ui-red.log`: existing 9 behavior tests pass; both added reload recovery and definitive-permission correction/close cases fail.

GREEN gates:

- `npm run test:lucky-wheel --workspace @celebix/customer-panel`: 19/19 first candidate; **27/27 final follow-up** (`admin-source-recovery-green.log`). Real client tests prove before-request persistence, reload/retry body/key identity and one fake server ledger record, changed-intent blocking, scoped recovery, malformed permission-response retention, storage denial, rejection of automatic source creation before any HTTP call, and auth rejection during recovery retaining original identity. Rendered tests prove recovered form and definitive error correction/close.
- PromotionList/PromotionEditor behavior suites: **18/18** (`admin-managed-ui.log`).
- `npm run typecheck --workspace @celebix/customer-panel`: exit **0** first candidate and **0** final follow-up (`admin-source-recovery-typecheck.log`).
- `npm run build --workspace @celebix/customer-panel`: exit **0**, compile and all routes generated for first candidate (`admin-build.log`). This build precedes the source-creation follow-up; root owns the fresh integrated build after all workers' fixes.
- Neighbor adapters/UI suite: **148/151**. The same three source-string assertions already fail at `e59336cd1`. Isolated git-show copies of only required baseline files gave **7/10**, the identical three failures (`admin-baseline-tests.log`): “editor saves and checks the current draft before offering the separate publish action”; “editor exposes every controlled merchant field and only server-backed checks and simulator”; “editor keeps dirty protection through unload, links, cancel and close, and clears only after saved persistence”. These assert an obsolete separate-publish/source representation. They were not changed under this task.
- Updated the narrow route assertion to require the dedicated `renderLuckyWheelPage` adapter instead of the old generic feature record mount.
- `git diff --check` passed for owned changes before each commit.

## Rulings and limits

- User-approved feature/backend work authorizes the necessary HTTP/runtime implementation despite the Mira presentation skill's usual presentation-only boundary.
- Preserve real legacy archive status via the typed status. Native deletion hides a retained record; it does not invent an archived campaign state.
- Stats use the existing supported TRY basis. UI explicitly says: “Kuponlu satış, tamamlanmış sipariş toplamıdır; kısmi iadeler düşülmez.” No net-income or fully refund-adjusted claim.
- History shows up to the server's bounded latest entries and truthfully notes more entries when `hasMore` is true.
- Root owns independent review, native ordinary-cart/no-automatic-discount acceptance, real merchant/browser validation at 390/1024/1440, full integrated rebuild and release. This worker did not self-review the implementation or claim final production/browser acceptance. Root has separately exercised initial 1440 uncertain-save/key-retention flows; final acceptance is recorded by root.

## Evidence SHA-256

| Log | SHA-256 |
| --- | --- |
| `admin-red.log` | `5d49a9ac2b5c1a1b670bb4c3ffdc20a26a6b0b9b61b7a2e34bc9482919e70273` |
| `admin-ui-red.log` | `f7ce0479b2fecd6725b435e260487196c0da3e37acad27bfeb4617a154620eb4` |
| `admin-managed-red.log` | `7a816cc8145c6ea718dd6c60007b19e57238a427b7f4cd2f6f2f2bff5075416b` |
| `admin-managed-ui-red.log` | `5059cadb0b6c4006c07b353cdf1ebd1fe263e5bc0fc0565be256a49e919a9473` |
| `admin-source-recovery-red.log` | `3ff6ce8722eae6b0e9207a73d1bf3c64d72f3ee745d7dfd0760c1b52f2a1e0fa` |
| `admin-source-recovery-ui-red.log` | `c4e2334def527b783261545aa34cb0de96239500398c016ab9a9d56dc9e3de9a` |
| `admin-tests.log` | `bf352f6563aabe147acd2f61c97c48d23e91b1eeef2f5439bfbcc02a0d68b81b` |
| `admin-managed-ui.log` | `7ab8b115954be0842d52caabaaebefc3165749dabd03abbf94a7086224e06319` |
| `admin-typecheck.log` | `818a846ca9b17247e97147558bcc87379d472359fac6e1fe51bc5026d6f6dd7d` |
| `admin-build.log` | `e7d16a1cdb499a799706d4224103886956ecb37451481efa5d221974f11bbe1a` |
| `admin-baseline-tests.log` | `800392415744d5be9312bc092289439eb72e6d3bd798ccb7b124ae6fb188258d` |
| `admin-neighbors.log` | `40c0781bdab03a15ceed6d86f1d34121b7093a2a257f93dc7a67c2ae0b9195d1` |
| `admin-source-recovery-green.log` | `9424d839605ede5a2571f974804df1563a3cefc7c4a743121049797e1d638cda` |
| `admin-source-recovery-typecheck.log` | `818a846ca9b17247e97147558bcc87379d472359fac6e1fe51bc5026d6f6dd7d` |
