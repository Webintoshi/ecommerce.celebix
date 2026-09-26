# Approved settings UI — 2026-09-26

## Scope and baseline

- User approved the settings HTML concept and requested implementation. Deployment is a separate, unrequested step in this turn.
- Branch: `codex/settings-approved-ui`; baseline `0adfd8b209a5ff0432ba86d479e2dcc4804b3e97` (shared live source beneath documentation: `d02c41604cd26cec4d8cd93cbdabe76029c8822c`).
- Application: `apps/customer-panel`, shared by tenant admin panels. No `apps/admin`, API handlers, database migrations, shared contracts, dependencies, or lockfiles changed.
- Approved concept: `settings-concept` in the task's visualization directory. Existing functions were inventoried before implementation; the concept is not used as a production data source.

## Delivered surfaces

| Route | Presentation and workflow |
| --- | --- |
| `/settings` | Searchable four-group overview with distinct lightweight SVG illustrations |
| `/settings/general` | Store, region and product-code sections |
| `/settings/domains` | Existing storefront/admin addresses, DNS status and recovery actions |
| `/settings/language` | Default and enabled languages |
| `/settings/administrators` and invite create/edit | Existing team list and roles, compact invitation form |
| `/settings/payment` | Existing methods/providers with flatter rows and retained configuration dialogs |
| `/settings/pricing` | Reference, preview and history tabs; existing risk/activation controls |
| `/settings/shipping` | Sender, COD and Basit Kargo connection controls |
| `/settings/notifications` | Order notification and sender fields |
| `/settings/analytics` | Existing tracking, cart and recovery settings, now linked in settings navigation |
| `/settings/artificial-intelligence` | Existing provider configuration and masked credential states |
| `/settings/design` | Seven inline editing steps alongside the real storefront preview |

Canvas is `#f8f7f5`; graphite actions and restrained orange accents. Settings-specific CSS remains scoped. Visible page headings are suppressed; section labels, semantic headings, error states and security/risk information remain available. Existing sidebar dimensions and storefront runtime are preserved.

## Behavior and access

- Existing server tenant/auth/capability checks and actual API clients remain in place.
- Forms retain input after save failures, lock pending mutations and distinguish saved/unsaved/read-only states.
- Singleton settings adopt the committed version before auxiliary reloads, so an audit/reload failure cannot leave the next save using a stale version.
- Mobile settings selection activates the real link, preserving editor navigation vetoes. Dirty settings protect in-app navigation and browser refresh.
- Shipping refresh cannot discard edited sender/COD choices. Resource saves preserve an unfinished API key draft.
- Design draft debounce, version conflict, recovery, media upload and publish workflows remain intact. The inline editor does not apply modal body locking or a focus trap.

## Verification

Commands below run from repository root unless specified. Happy DOM tests exercise mounted actual components and mocked network/framework boundaries; they do **not** verify browser geometry, hit testing or visual fidelity.

| Gate | Result |
| --- | --- |
| Settings information architecture, merchant console, navigation, domains and analytics focused suite | 74/74 passed |
| Merchant admin route/consumer behavior | 7/7 passed |
| Design component, lifecycle, recovery and publish suite | 60/60 passed |
| Payment, shipping and reference-pricing client/model/component suite | 84/84 passed before the final shipping protection change |
| Final mounted settings/provider regression and shipping component suite | 11/11 passed, including final shipping and browser-refresh protection changes |
| Customer panel typecheck | Passed, exit 0 after final source and regression changes |
| Customer panel production build | Passed, exit 0; compiled, typechecked, generated 90/90 pages and completed tracing |
| `git diff --check` | Passed after final source changes |

Focused suite:

```sh
node --experimental-transform-types --test --test-reporter=tap \
  apps/customer-panel/lib/settings-information-architecture.test.ts \
  apps/customer-panel/lib/merchant-admin-console.test.ts \
  apps/customer-panel/lib/panel-ui/navigation.test.ts \
  apps/customer-panel/lib/store-domain-settings.test.ts \
  apps/customer-panel/lib/analytics-console.test.ts \
  apps/customer-panel/lib/analytics-http/settings-handler.test.ts

node --experimental-transform-types --test --test-reporter=tap \
  apps/customer-panel/lib/merchant-admin-ui/route-behavior.test.ts

node --experimental-transform-types --test --test-reporter=tap \
  apps/customer-panel/lib/settings-approved-regressions.test.ts \
  apps/customer-panel/components/shipping/ShippingSettingsConsole.test.ts \
  apps/customer-panel/lib/settings-provider-regressions.test.ts

npm run typecheck --workspace @celebix/customer-panel
npm run build --workspace @celebix/customer-panel
```

Commerce suite (from `apps/customer-panel`):

```sh
node --experimental-transform-types --test \
  lib/payment-settings-console.test.ts \
  lib/payment-settings-ui/model.test.ts \
  lib/payment-settings-ui/provider-preferences.test.ts \
  lib/built-in-payment-methods/controller.test.ts \
  lib/payment-method-ui/client.test.ts \
  lib/shipping-ui/client.test.ts \
  lib/reference-pricing-ui/client.test.ts \
  lib/reference-pricing-ui/model.test.ts \
  components/shipping/ShippingSettingsConsole.test.ts
```

Focused, route and final regression logs are available in `/tmp/settings-approved-{focus,routes,behavior}.log`; those temporary logs are not repository artifacts. Commerce and design results were reported by the implementing agents' completed tool sessions, without saved log files. The exact design command was not retained in the agent's compacted history; its reported 60/60 result is not a new independently repeated root run.

## Remaining acceptance and integration

- Rendered visual QA at 1440, 1024 and 390px was attempted through CUA on the actual local implementation, but the browser connection stopped responding and then exposed no browser surface. No screenshots or viewport overflow/hit-testing acceptance were produced in this turn. Build/test results must not be reported as visual acceptance.
- An earlier production build compiled and generated 90 pages, then failed during tracing with `ENOSPC`. A later retry was deliberately stopped to avoid overlapping the independent owner build. The final sequential build passed. Only this worktree's reproducible panel `.next/cache` and stopped browser fixture's `.next` output were removed to recover space; source and tenant data were untouched. Typecheck/build logs are `/tmp/settings-approved-typecheck-final.log` and `/tmp/settings-approved-build-final.log`.
- The test browser fixture uses actual settings components and a relative symlink to public assets; it is not a substitute for authenticated tenant acceptance. Some provider routes require their actual API boundaries.
- Another task is changing design-workspace behavior on `codex/design-workspace-fixes`. Before any later deployment, integrate those changes with this branch's inline editor and rerun the affected design gates. Do not overwrite the newer design rollout with this baseline.
- No tenant panel was deployed and no live data was written during this implementation turn.
