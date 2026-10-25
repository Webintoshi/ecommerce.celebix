# Guest-first product reviews

The user approved the researched sequence: expose five selectable stars and the review fields before sign-in; a valid explicit submit starts WhatsApp sign-in only when necessary; return to the same product with the draft retained and complete that intent once. Keep the existing reviews-page setting and pending moderation.

## Scope

- Shared storefront component used by all five product layouts. Default-off setting, native274 authority, purchase provenance, moderation, and invitation flow remain unchanged.
- Base the work on d1ce6d7e5cf141994d0a47374bd5845bb395443c, preserving the recently published product-form polish.
- No backend, SQL, API, dependency, credentials, or general account-policy changes.

## Behavior

- Enabled guests and signed-in customers see the same compact star/name/optional-title/body form and `Yorumumu gönder` action. Start with no star selected; require a chosen rating, name and body. Mention subsequent WhatsApp verification to guests.
- Before leaving the product, persist a bounded draft and explicit operation intent in origin-scoped sessionStorage keyed to product UUID and exact safe product pathname. Never place review text, OTP or identity data in URLs.
- Expire drafts after 30 minutes. Preserve partial edits on change, without polling. If storage is blocked, keep fields in the mounted form and explain the issue instead of navigating and losing text.
- Existing safe WhatsApp login/profile completion returns to the product pathname. A pending `awaiting-auth` intent resumes once after authenticated availability. Claim `sending` before the request; reuse its exact operation UUID and payload.
- A reload after an uncertain or interrupted send restores the exact locked retry, without an automatic request loop. Known 401 routes through sign-in after preserving the intent. A disabled setting cancels the pending intent. Known duplicate or successful submission clears the draft and acknowledges moderation.
- Raw partial fields and a normalized submission payload remain distinct; immutable pending payload must match the normalized fields. Other stores/products/paths cannot consume a draft.

## Acceptance

Guest sees fields → selects rating and writes → submits → existing WhatsApp login; authenticated return → retained fields → one pending submission. Also cover cancellation, expired/corrupt draft, blocked storage, double click, StrictMode/remount, uncertain retry and disabled setting.

## Publication

Only two shared storefront applications, NET then SITE. Preserve panels at d1ce6d7e5cf141994d0a47374bd5845bb395443c, owners at 5c0cc6a90896f203ba86d6cd7798d699953175f2 and every installed native274 function. Use exact candidate source proof, official storefront build, fresh HTTPS proof, Dockerfile admission, canonical publisher lock, source leases, raw configuration witnesses, global idle, and >=11 GiB before each queue. Capacity recovery, if necessary, requires a separately reviewed exact-unused-cache plan; no broad prune.
