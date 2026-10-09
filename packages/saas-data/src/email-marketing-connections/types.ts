import type { EmailMarketingProvider } from '@celebix/saas-contracts';
export type EmailMarketingCredentialBinding = Readonly<{storeId: string; credentialOwnerId: string; provider: EmailMarketingProvider; purpose: 'candidate' | 'connection' | 'webhook'; credentialVersion: number}>;
export type SealedEmailMarketingCredential = Readonly<{algorithm: 'A256GCM'; version: 1; keyId: string; iv: string; tag: string; ciphertext: string}>;
