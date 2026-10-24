import type { PaymentProviderExecutionAuthority } from "@celebix/saas-contracts";

export type AkbankCandidateBuildMetadata = Readonly<{
  buildMetadataSchemaVersion: 1;
  evidenceSchemaVersion: 1;
  providerCode: "akbank_json";
  capability: "payment_processing";
  environment: "test" | "live";
  adapterVersion: 1;
  gitSha: string;
  sourceDigest: string;
  candidateExecutionDigest: string;
}>;

export type AkbankGeneratedBuildMetadataMap = Readonly<{
  test: AkbankCandidateBuildMetadata | null;
  live: AkbankCandidateBuildMetadata | null;
}>;

export type AkbankExecutionAuthorityMap = Readonly<{
  test: Readonly<PaymentProviderExecutionAuthority> | null;
  live: Readonly<PaymentProviderExecutionAuthority> | null;
}>;

// Source candidates and execution admission are generated independently.
// No bank or sandbox acceptance is asserted by the source-control defaults.
export const AKBANK_GENERATED_BUILD_METADATA: AkbankGeneratedBuildMetadataMap = Object.freeze({test:null,live:null});
export const AKBANK_GENERATED_APPROVED_EXECUTION_AUTHORITIES: AkbankExecutionAuthorityMap = Object.freeze({test:null,live:null});
