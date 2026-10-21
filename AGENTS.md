# Shared release verification

- Before queuing an owner, customer-panel or shared storefront deployment, run
  `npm run check:signup-release` in the checkout of the **exact candidate commit**.
  Verify NET and SITE use that reviewed candidate. Do not rely only on a branch
  name, a past commit's checks, or an application build succeeding.
- If the source-bound signup proof is missing or stale, correct the compatibility
  issue, run `npm run refresh:signup-release` with Node.js 24+ and PostgreSQL 16,
  and commit the generated proof with the tested sources. Never hand-edit proof
  hashes or skip/remove the configured guard to publish.
- Signup rehearsals use disposable socket-only PostgreSQL clusters. Never point
  them at a live database or reuse a customer's OTP, consent, or registration.
- Preserve immutable historical tariff snapshots and idempotent signup replay
  when changing package defaults, limits, features, SQL or session completion.
  A change must pass the current-default and historical snapshot native suites.
- Historical storefront Dockerfiles predate the build hook. Their explicit
  publication or rollback requires separate reviewed admission; do not assume
  Coolify's Nixpacks build-command guard runs for Dockerfile builds.
- Before publishing signup or shared hostname infrastructure, also run
  `npm run verify:signup-edge`. Both NET and SITE must pass trusted HTTPS on
  fresh, previously unknown admin and storefront names. An existing store's
  exact-host certificate or a successful database rehearsal is not sufficient.
  Never bypass certificate errors or replay customer handoff tokens to test it.

See `docs/signup-release-guard.md` for the commands, coverage and recovery steps.
