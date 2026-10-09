# Provider clarification requests and submission status

Prepared 2026-10-09. Brevo: sent with explicit user authorization; response pending. Klaviyo: optional draft, not submitted and not a private-key activation prerequisite. Future messages still require human authorization and a verified provider support channel.

## Brevo — sent; response pending

Sent 2026-10-09 at 19:05:36 UTC (22:05:36 Europe/Istanbul), from `celebixco@gmail.com` to `support@brevo.com`, the notice address in [Developer Terms §14.8](https://developers.brevo.com/docs/apps-developer-terms). Gmail SENT status and exact message content were verified. A subsequent read found no reply or automatic acknowledgment. This requests the registration process and clarification; it is not completed registration or approval.

Subject: Celebix distributable integration registration and encrypted merchant API keys

Celebix is a multi-tenant commerce platform. We have implemented an optional Brevo integration: a merchant supplies their own API key, validates the canonical account, and creates a dedicated list. Only address-bound, proven email marketing consent and optional names are synchronized. Campaign preparation and sending remain in Brevo. Credentials are encrypted server-side, bound to the merchant/store/provider/purpose/version, excluded from public responses and logs, and retained during disconnect only to reconcile sent effects and remove managed membership/hooks. Stores cannot share a canonical account.

Please provide the registration process required by Developer Terms §7.1 and confirm whether this encrypted merchant-key model is permitted under §8(i), or specify the required approved alternative. Please also confirm factual interoperability use of the official Brevo wordmark under §9.4. Our installation dialog includes the §6.5 no-review/test/certification/endorsement disclosure. We have not activated real merchant exports or collected real keys for this integration.

We can provide a demo with synthetic recipients, a data-flow diagram, retention/revocation description and requested security evidence. No customer data or credentials will be included.

## Klaviyo — optional clarification draft, not a prerequisite

Subject: Celebix optional Klaviyo connection and provider-choice permission

Celebix is a multi-tenant commerce platform. Its email settings offer Brevo and Klaviyo as alternatives; only one provider is active for a store. There is no combined reporting, campaign editor, sending API or data transfer between providers. Merchants supply their own account/private key, select a managed list, and approve export of address-bound email consent and optional names. Existing or suppressed profiles are never automatically resubscribed. Campaign management remains in Klaviyo.

Before activation, please confirm written permission for this optional two-provider chooser under the competitor/aggregated-view provisions of the API Terms and for factual interoperability use of the official Klaviyo mark. Please confirm whether private-key authentication is permitted for this deployment outside a published marketplace app, or whether partner registration/OAuth is required. Credentials are encrypted and tenant-bound; disconnect preserves only the minimum credential/evidence required to finish revocations and cleanup.

No real merchant key or customer export has been used in acceptance testing. We can provide a synthetic demonstration and architecture/security evidence through your approved channel.

2026-10-09 source review: Klaviyo documents private-key use by trusted third parties outside marketplace publication. The draft above is optional clarification; it has not been sent and is not treated as a universal private-key activation prerequisite. The Brevo registration/key-handling request has been sent and awaits a response; Brevo remains disabled. No real merchant-key acceptance test has been performed.
