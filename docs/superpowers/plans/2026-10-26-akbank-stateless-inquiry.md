# Akbank stateless inquiry response compatibility

## Evidence and scope

The authenticated LIVE 1010 inquiry returns HTTP200, signed VPS-1123 and
`Set-Cookie`. The bounded transport correctly rejects cookie-bearing responses;
therefore admitting VPS-1123 alone did not activate the pending profile.

Add one narrowly scoped fetch compatibility function outside the existing
execution closure. Only an exact, compact, signed, credentialless 1010 request
to the fixed Akbank endpoint can discard the unused `Set-Cookie` response header.
Keep redirect, Location, Set-Cookie2, media, timeout, size, HMAC and terminal
binding checks. Preserve the raw response stream and all other headers. No cookie
jar, retry, sale, refund, credential change or fabricated validation result.

## Implementation and verification

- [x] Add focused RED evidence and the shared compatibility function.
- [x] Wire owner validation, customer-panel hosted payments and shared storefront.
- [x] Preserve the owner's existing PayTR media compatibility composition.
- [x] Package169 tests, focused production7 tests and adapter typecheck pass.
- [x] One controlled LIVE read-only1010 using the exact helper validates current
  credential3; HMAC and both bank identifiers match. No profile mutation or charge.
- [x] Existing six execution closure files and build binding remain unchanged.
- [ ] Refresh the official signup proof and commit the exact candidate.
- [ ] Run all three official builds and exact-candidate generator/signup checks.
- [ ] Publish all six readers serially with full native278/authority/configuration
  witnesses. Change existing source pins and SOURCE_COMMIT only.
- [ ] Observe normal worker activation and the public checkout payment method.

Native278, the LIVE36e980 execution authority and every other provider authority
remain unchanged. Existing pending/active profiles are compatible with both
reader generations. Root remains the sole publisher.
