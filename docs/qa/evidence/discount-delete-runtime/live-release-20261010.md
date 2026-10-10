# Discount deletion runtime live release — 2026-10-10

- Application candidate: `3fb989171f52c485a3905fc80ee481cd68195339`; previous panel source: `975f9b3950877df9b4be417c1ff653006e08df2e`.
- NET → SITE rollout completed. NET `b132ioe18x0t9zc228bbu75m` and SITE `srxi0rwgu2jj6eebwjae8arm` finished without deployment error markers. Both running images and source bindings match the candidate.
- Final six-application and seven-alias read-only acceptance passed. The four owner/storefront witnesses retain `446557f574ef3d99081f54f2fe138b1fe487a55a`, their container identities and protected configuration. Existing payment/Google/keyring/email settings and full owner workers remain preserved. The global deployment queue is idle.
- Native225 was already applied by the previous release. This release adds no SQL migration or native mutation; the fresh catalog matches the accepted witness (1743 functions).
- The installed official queue helper was reviewed and bound by exact hash. The initial prepublication check stopped because the shared release lock was absent. Root inspected both host and container, exclusively recreated that lock, then manually resumed the check. The repair changed no application configuration and queued no deployment.
- Authenticated Chrome on `https://admin.guzidekuyumcu.com` loaded the reported promotion's deletion impact, enabled **Sil**, and cleared the prior error. The client accepted the impact payload; raw HTTP status was not captured. No deletion was submitted and no merchant promotion was deleted during acceptance.
- Scoped checks: **59 passed, 0 failed**; candidate production build passed with **97 pages**. The full panel first stage had **2,357 tests: 2,293 passed, 63 failed, 1 skipped**. All **61** baseline failure names remain; the **2** extra timing failures passed independently without source changes. The chained second suite was not reached. The full suite is still failing.
- Release checks invoked no payment/email provider and created no production fixtures. Raw configuration, session data and diagnostic payloads remain private.

Machine receipt: [live-release-20261010.json](live-release-20261010.json). Final sealed kit digest: `b28a55322aa9e4919b148ede22c5a5c0b84e7aea17079deff60ba820e83fad3f`.
