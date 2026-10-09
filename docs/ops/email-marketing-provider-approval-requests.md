# Prepared provider clarification requests

Prepared 2026-10-09. Not submitted. Route through each provider's verified developer/partner support channel; do not infer an email address. Human authorization is required before sending messages to another party.

## Brevo

Subject: Celebix distributable integration registration and encrypted merchant API keys

Celebix is a multi-tenant commerce platform. We have implemented an optional Brevo integration: a merchant supplies their own API key, validates the canonical account, and creates a dedicated list. Only address-bound, proven email marketing consent and optional names are synchronized. Campaign preparation and sending remain in Brevo. Credentials are encrypted server-side, bound to the merchant/store/provider/purpose/version, excluded from public responses and logs, and retained during disconnect only to reconcile sent effects and remove managed membership/hooks. Stores cannot share a canonical account.

Please provide the registration process required by Developer Terms §7.1 and confirm whether this encrypted merchant-key model is permitted under §8(i), or specify the required approved alternative. Please also confirm factual interoperability use of the official Brevo wordmark under §9.4. Our installation dialog includes the §6.5 no-review/test/certification/endorsement disclosure. We have not activated real merchant exports or collected real keys for this integration.

We can provide a demo with synthetic recipients, a data-flow diagram, retention/revocation description and requested security evidence. No customer data or credentials will be included.

## Klaviyo

Subject: Celebix optional Klaviyo connection and provider-choice permission

Celebix is a multi-tenant commerce platform. Its email settings offer Brevo and Klaviyo as alternatives; only one provider is active for a store. There is no combined reporting, campaign editor, sending API or data transfer between providers. Merchants supply their own account/private key, select a managed list, and approve export of address-bound email consent and optional names. Existing or suppressed profiles are never automatically resubscribed. Campaign management remains in Klaviyo.

Before activation, please confirm written permission for this optional two-provider chooser under the competitor/aggregated-view provisions of the API Terms and for factual interoperability use of the official Klaviyo mark. Please confirm whether private-key authentication is permitted for this deployment outside a published marketplace app, or whether partner registration/OAuth is required. Credentials are encrypted and tenant-bound; disconnect preserves only the minimum credential/evidence required to finish revocations and cleanup.

No real merchant key or customer export has been used in acceptance testing. We can provide a synthetic demonstration and architecture/security evidence through your approved channel.
