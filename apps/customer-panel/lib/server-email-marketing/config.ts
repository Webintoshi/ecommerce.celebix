import type { MerchantProviderCredentialKeyring } from '@celebix/saas-data';
// Missing rollout authority disables this optional capability. Hook cleanup remains
// registered independently while retained connections still need reconciliation.
export function emailMarketingConfiguration(source: Readonly<Record<string, string | undefined>>, keyring: MerchantProviderCredentialKeyring): Readonly<{
    enabled: boolean;
}> { return Object.freeze({ enabled: source.CELEBIX_EMAIL_MARKETING_CONNECTIONS_ENABLED === 'true' && keyring.keys.some(k => k.keyId === keyring.activeKeyId && k.key.length === 32) }); }
