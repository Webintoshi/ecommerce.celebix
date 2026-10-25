# Akbank hosted POS implementation plan

**Goal:** Complete the modern Akbank credential, hosted checkout and verified return path for shared stores, with Ezmeo real-store acceptance.

**Spec:** `docs/superpowers/specs/2026-10-25-akbank-hosted-pos-design.md`.

**Execution:** implement in the existing isolated checkout with parallel disjoint tasks, then review and integrate under one release owner. User explicitly requested completion; no additional design round is required.

## Global constraints

- No card collection, extra sale after hosting, plaintext secrets, untrusted redirects/HTML, fabricated payment proof, or removal of existing payment authority/idempotency checks.
- Canonical provider `akbank_json` only. Use exact official bank endpoints and raw-byte HMAC validation.
- Existing native routines/payment providers remain compatible. New schema is additive and rehearsed on socket-only disposable PostgreSQL16.
- Publishing includes both NET and SITE. Root owns all live mutations/refs/pins/queues; subagents do not touch credentials or live systems.

## Tasks

- [ ] **Protocol/adapter:** persist official research; write failing tests for independent HMAC vectors, raw response authenticity and safe status mapping. Add isolated `providers/akbank/{config,packet,adapter}.ts` and tests. No existing-provider edits in this task.
- [ ] **Shared transport/contract:** add strict typed form POST and Akbank-only signed JSON transport with regression tests proving existing header/response contracts remain unchanged. Export the adapter and credential-validation API.
- [ ] **Data/native:** extend the reviewed provider/presentation allowlists and create migration275 plus assertions/native tests. Snapshot current function definitions before deciding exact replacements; do not edit historical migrations or old snapshots.
- [ ] **Storefront:** integrate provider activation and typed form presentation, encrypted session persistence, exact callback Origin/parser and result flow. Add focused tamper/replay/wrong-amount/unknown-outcome and renderer/CSP tests.
- [ ] **Panel/owner:** add the modern bank descriptor and worker validator, reuse encrypted credential saving, add honest capabilities/preferences and active-method workflow. Test unsupported classic bank remains unavailable.
- [ ] **Integration/review:** run all affected payment suites, type checks and required builds; verify old providers and native/signup compatibility. Independently review signature/status/callback and native permission boundaries.
- [ ] **Release:** bind reviewed source evidence/build metadata, take fresh runtime/native/control-plane baseline and backup, rehearse/apply migration, deploy compatible owner then NET→SITE panels/storefronts through the canonical release mechanism.
- [ ] **Acceptance:** verify Ezmeo UI, credential validation and bank-hosted page using authorized existing data without recording secrets. Hand off actual payment/credential-changing steps when required; verify the resulting callback/order if performed.

## Review focus

1. Authenticated bank response with wrong amount/order/merchant must not capture.
2. Interrupted submit/duplicate or delayed return must not issue a second charge or repeat order/stock/accounting effects.
3. Signed inquiry success without a completed sale must remain unpaid.
4. New POST presentation must not broaden the old providers' URL, card-data, header or CSP policies.
5. Existing tenant/payment authority and immutable historical tariff/native snapshots must survive mixed-version rollout.
