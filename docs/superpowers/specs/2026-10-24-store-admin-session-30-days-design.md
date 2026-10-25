# Store admin WhatsApp session lifetime

The user authorized direct implementation and shared rollout: store owners, administrators and cashiers remain signed in until logout, with fresh WhatsApp verification required at an absolute deadline 30 days after sign-in. No customer notification, new setting or reminder is requested.

Use the existing server-side session family and persistent Secure/HttpOnly cookie. Extend the actual verified WhatsApp issuer and compatible session readers, preserving the original deadline across rotation, store switching and domain handoff. Temporary OTP and handoff credentials retain their current short lifetimes. Legacy eight-hour sessions keep their issued expiry; the new lifetime applies on the next verified sign-in. Central owner TOTP and storefront customer authentication retain their existing rules.

## Approach

An absolute 30-day session fits the request and existing family revocation. Sliding renewal would postpone the requested verification deadline. A separate remembered-device credential would add another mechanism and an unnecessary extra choice. Use shared TypeScript lifetime constants and a forward-only native migration with guarded rollback.

## Acceptance

New verified store sessions work beyond eight hours, survive browser restart, and expire at 30 days. Rotation and handoff preserve the deadline. Logout, access removal and security-version changes revoke access. Reject overlong, expired, mismatched and unauthorized sessions. Existing eight-hour sessions and central authentication remain compatible. Publish compatible readers first, then native issuance, and verify actual running sources on NET and SITE.
