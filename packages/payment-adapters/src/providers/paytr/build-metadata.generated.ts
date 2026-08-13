import type { PaymentProviderExecutionAuthority } from "@celebix/saas-contracts";

export type PaytrCandidateBuildMetadata = Readonly<{
  buildMetadataSchemaVersion: 1;
  evidenceSchemaVersion: 1;
  providerCode: "paytr_iframe";
  capability: "payment_processing";
  environment: "test" | "live";
  adapterVersion: 1;
  gitSha: string;
  sourceDigest: string;
  candidateExecutionDigest: string;
}>;

export type PaytrGeneratedBuildMetadataMap = Readonly<{
  test: PaytrCandidateBuildMetadata | null;
  live: PaytrCandidateBuildMetadata | null;
}>;

export type PaytrExecutionAuthorityMap = Readonly<{
  test: Readonly<PaymentProviderExecutionAuthority> | null;
  live: Readonly<PaymentProviderExecutionAuthority> | null;
}>;

// Builds replace these closed defaults with commit-bound generated literals.
export const PAYTR_GENERATED_BUILD_METADATA: PaytrGeneratedBuildMetadataMap =
  Object.freeze({ test: null, live: null });

export const PAYTR_GENERATED_APPROVED_EXECUTION_AUTHORITIES: PaytrExecutionAuthorityMap =
  Object.freeze({ test: null, live: null });
