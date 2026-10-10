# Lucky Wheel — explicit cancel follow-up

Date: 2026-10-10. Product candidate: `e2fbc9e204664e57997cc7854bd3368e2c803ea4`.

## Cause and correction

`LuckyWheelEditor` intercepted explicit dismissal of a changed form and opened a second discard confirmation below the active tab's entire form. The notice had no automatic focus or scroll, so the footer's **Vazgeç** appeared ineffective, especially on the long reward tab.

Explicit **Vazgeç**, header close, Escape and backdrop dismissal now discard unsaved editor state and close directly. The shared modal, source picker, APIs and data contracts are unchanged. In-flight writes and uncertain saves still block closing; browser navigation retains its dirty/uncertain/write protection until the editor unmounts.

## Verification

- Four rendered regressions failed before the correction and passed afterward. They assert dialog removal, zero save/source/delete/revoke calls, restored trigger focus, unlocked body scrolling, removed unload listener and persisted values on reopen.
- Scoped Lucky Wheel suite: **33 passed, 0 failures**. Customer Panel typecheck and production build: exit 0. Independent narrow source and release-kit reviews passed.
- Authenticated Google Chrome on live Güzide: changed a new form, pressed **Vazgeç**, observed the closed list, then reopened the original **Yeni çark** value. Changed forms also closed with the header button and Escape. Final focus was **Çark ekle**, dialog count 0 and body overflow empty. No campaign/source save or customer spin was submitted.
- Browser logs captured 21 errors from a Chrome extension's `executors/200.js`; none were application errors. This is not a claim of a completely empty browser console.

## Publication

| Target | Deployment | Accepted (UTC) |
| --- | --- | --- |
| PANEL NET | `wheel8d53fd6dccfbdd117921` | 05:38:29 |
| PANEL SITE | `wheelc36fce31b318594b3fa8` | 05:42:45 |

The guarded NET → SITE rollout used the official deployment helper and exact candidate, with NET runtime acceptance gating SITE. Both running panel images and wheel routes match the candidate. HTTPS checks cover eight shared admin aliases: login reachability and exact anonymous API 401 denial. Authenticated behavior was checked separately on Güzide.

Final verification at **05:43:09 UTC** confirmed six-application configuration/environment/settings preservation, automatic deployment disabled and no busy deployment queue. The two owner and two storefront images and source refs remain at `0619ec57182af92eb23bc80d6fc16e5896a37043`. This UI follow-up applied no database migration and created no production sample campaign, coupon, customer, order or payment.

## Evidence

- [Scoped test and review summary](evidence/lucky-wheel-cancel/test-summary.json)
- [NET acceptance](evidence/lucky-wheel-cancel/accept-panel_net.json) and [SITE acceptance](evidence/lucky-wheel-cancel/accept-panel_site.json)
- [Final configuration and runtime verification](evidence/lucky-wheel-cancel/final-verification.json)
- [Authenticated Chrome checks](evidence/lucky-wheel-cancel/authenticated-ui.json) and [closed-editor screenshot](evidence/lucky-wheel-cancel/closed-editor.jpg)

Private configuration snapshots and release intents remain on the server; their contents are not included in tracked evidence. This verification is scoped to the cancel correction and its publication, not the entire admin test suite.
