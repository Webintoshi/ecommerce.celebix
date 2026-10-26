# Akbank callback transport compatibility

## Evidence and scope

The real return reached the bound Akbank callback and received INVALID. The
matching attempt has only begin/initialize events. Its payment outcome is not
established by that rejection. Next 16.2.1 constructs the route Request URL from
its internal listener; the deployed app uses port 3450 and trustHostHeader=false.
The callback reader previously accepted only the external HTTPS URL.

## Implementation

1. Reproduce rejection with the real Next listener URL shape, using synthetic
   callback data and no bank connection.
2. Preserve the external URL rule and accept only HTTP/HTTPS localhost or
   0.0.0.0 listener URLs with a valid explicit port and exact bound callback path.
   The runtime must authenticate the existing proxy authority first. Never
   construct authority from an unverified forwarded header.
3. Preserve all body, Cookie, bank Origin, signature, terminal, amount, reference,
   expiry and signed-inquiry controls. No new sale, callback replay or direct
   payment-state mutation is part of this repair.
4. Test authenticated internal transport through the actual Akbank adapter and
   reject untrusted proxy authority before credential/provider access.
5. Refresh the official signup compatibility proof and build the shared
   storefront. Publish storefront NET, then SITE with the official deployment
   path. Keep the four owner/panel applications, native 278 and compiled payment
   execution authorities unchanged.

## Acceptance

The new positive test fails before the implementation and passes afterward.
The bounded callback/runtime suite passes, including matching signed inquiry
before capture and no additional sale request. Production source, health and
existing financial state must be read back. A new user card transaction is not
part of automated acceptance and success must not be claimed until verified.
