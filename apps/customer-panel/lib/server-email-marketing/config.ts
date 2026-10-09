import type { MerchantProviderCredentialKeyring } from '@celebix/saas-data';
import type { EmailMarketingProviderAvailability } from '@celebix/saas-contracts';
// Missing rollout authority disables this optional capability. Hook cleanup remains
// registered independently while retained connections still need reconciliation.
export function emailMarketingConfiguration(source: Readonly<Record<string, string | undefined>>, keyring: MerchantProviderCredentialKeyring): Readonly<{
    enabled: boolean;
    providerAvailability: EmailMarketingProviderAvailability;
}> {
    const enabled=source.CELEBIX_EMAIL_MARKETING_CONNECTIONS_ENABLED === 'true' && keyring.keys.some(k => k.keyId === keyring.activeKeyId && k.key.length === 32);
    return Object.freeze({enabled,providerAvailability:Object.freeze({brevo:enabled && source.CELEBIX_EMAIL_MARKETING_BREVO_ENABLED === 'true',klaviyo:enabled})});
}
