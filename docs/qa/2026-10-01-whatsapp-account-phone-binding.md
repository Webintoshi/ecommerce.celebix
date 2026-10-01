# WhatsApp login and existing email account phone binding

## Observed failure

- A new phone-only Güzide registration completed OTP verification, profile completion and account navigation. Reload retained the authenticated session.
- With the same phone in Alpler, a correct newly delivered OTP returned `identity_conflict`. The phone was a merchant contact on an existing verified email account, rather than a verified phone identity. The two stores' records and sessions were distinct.
- Automatically adopting that contact would also grant access to its saved addresses. The fix requires the existing account session and the phone OTP together.

## Change

- The profile provides a WhatsApp verification action for an unverified existing phone. Sending is manual; the phone is fixed to the current profile.
- Binding starts require same-origin JSON, current CSRF, a full email account session and the unchanged profile phone. A sealed challenge records binding intent. Generic login keeps its existing verifier and ignores stale account cookies.
- Migration 190 adds an authenticated verifier without replacing the old verifier or changing tables. It locks and rechecks the store, account, session and customer. The customer's current email and phone must still match the authenticated account and requested phone.
- Existing email, customer identity, addresses and order links are preserved. A different verified phone owner, replaced contact, suspended account, expired session or other store cannot authorize binding.
- After one successful binding, ordinary phone-only login uses the original verifier.

## Verification

- Regression tests were observed failing before the runtime and repository changes, then passed.
- Final credential/request/route/runtime/repository tests: 47 passed.
- UI binding/form/client/page tests: 35 passed; 24 additional auth compatibility tests passed.
- `@celebix/saas-data` and shared storefront typechecks passed.
- Shared storefront and shared admin production builds passed. The admin build used non-production placeholder public configuration.
- Native PostgreSQL 16: 24 scenarios passed, including concurrent correct codes, six persisted wrong attempts, replay, store isolation, preservation, email drift and guarded down/reapply. The missing binding was reproduced against the predecessor before the change; the email drift regression also failed before its guard was added.
- Independent security review found the email drift guard above; it was added and verified. No remaining material findings.

## Live acceptance

- Migration 190 passed the guarded live dry run and assertions, then was committed. The original verifier and session-context definitions were preserved.
- Both shared storefront deployments finished at application commit `0788be35a07031b9b67fb18d6a3bd4e076403150`: NET `a10zv2kg3oqd6vkijl3eavdk`, SITE `yed1cvfomdxxqf8hk0shc5kd`. The guarded release verification confirmed both targets and an idle deployment queue.
- Final read-only runtime verification passed for image health, source SHA/manifest, the official generated artifact and approval environment agreement. SITE's existing PayTR database authority still matched; no payment provider was invoked.
- The user signed into the existing Alpler email account and completed its WhatsApp phone binding. The live profile now shows **Telefon Doğrulanmış** and states that the number can be used to sign in.
- Before/after comparison confirmed the Alpler customer, stable account fields, addresses and order links were unchanged. The same account's version advanced from 6 to 7.
- Read-only database acceptance found two distinct active accounts and customers across Güzide and Alpler for the same verified phone. Both accounts had active full sessions. Reloading Güzide after the SITE release retained its authenticated account while Alpler remained authenticated.
- Browser evidence is saved privately under `.tmp/whatsapp-login-20261001/`: `alpler-phone-verified.png` and `guzide-account-final.png`. Contact details, credentials and verification codes are excluded from this report.
