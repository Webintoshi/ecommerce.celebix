# Email provider protocol baseline

Verified 2026-10-09 against official API references. Native fetch only; no campaign-send API. Server credentials never enter public responses. Transport permits the exact required method/route operations, refuses redirects, caps responses at 1 MiB and includes body reads in a 5-second deadline. Write timeouts, network/5xx failures and invalid successful bodies have unknown outcomes and require reconciliation.

## Brevo

API `https://api.brevo.com/v3/`, `api-key` header. Canonical identity is `organization_id`. List creation discovers a real folder; an account without a folder needs the owner to create one in Brevo. The integration does not guess a folder ID or create an unmanaged folder. Names use existing FIRSTNAME/LASTNAME or FNAME/LNAME attributes. New consent evidence uses three explicitly owned text attributes: CELEBIX_CONSENT_AT/SOURCE/VERSION. Routine updates never write EMAIL or clear blacklists.

Contacts family: 10 requests/second and 36,000/hour. Other endpoints: 100/hour. Limits may be shared with other applications using that key; 429 and Retry-After are respected. This is not a verified subscriber/sending quota. Sender readiness remains unknown. First release uses full contact sweeps; modifiedSince/offset/creation sorting does not provide a snapshot cursor. Contact modifiedAt is not a consent-change timestamp. Untimed denials remain untimed in provider evidence.

Marketing hooks use documented bearer authentication over TLS. The integration owns only its hook ID. Webhook ID is not a unique delivery event ID. No invented HMAC, transactional unsubscribe or SMS mutation.

Sources: [rate limits](https://developers.brevo.com/docs/api-limits), [create list](https://developers.brevo.com/reference/create-list), [contacts](https://developers.brevo.com/reference/get-contacts), [secured webhooks](https://developers.brevo.com/docs/secured-webhooks).

## Klaviyo

API `https://a.klaviyo.com/api/`, private-key Authorization, revision 2026-07-15. Account resource ID is canonical. Profiles are looked up by email with subscriptions; list membership uses a separate documented read. List cleanup uses relationship DELETE and never global unsubscribe. An absent profile cannot be created by an unsubscribe job. Existing profiles—including suppressed or uncertain ones—never receive an automatic Subscribe.

Historical Subscribe includes the original past consented_at under subscriptions.email.marketing and historical_import=true. Ordinary subscriptions omit consented_at. Bulk subscribe/unsubscribe returns bare 202; acceptance is never completion proof and no undocumented job ID is invented. Provider-native reconsent is required for existing profiles.

Budgets: accounts 1/s,15/min; lists 10/s,150/min; list create also 150/day; profiles 75/s,750/min; profile-list read 3/s,60/min; membership writes 10/s,150/min; subscription jobs 75/s,750/min. Key/account sharing may lower available capacity. Worker additionally fences one Subscribe per profile per 30 minutes. Global and list-specific suppressions retain their scope and true timestamps. Paging accepts only fixed-origin, same-resource next links.

Sources: [profiles](https://developers.klaviyo.com/en/reference/get_profiles), [bulk subscribe](https://developers.klaviyo.com/en/reference/bulk_subscribe_profiles), [bulk unsubscribe](https://developers.klaviyo.com/en/reference/bulk_unsubscribe_profiles), [rate limits](https://developers.klaviyo.com/en/docs/rate_limits_and_error_handling).
