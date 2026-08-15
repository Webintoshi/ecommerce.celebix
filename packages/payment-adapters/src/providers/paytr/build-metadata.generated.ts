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

export const PAYTR_GENERATED_BUILD_METADATA: PaytrGeneratedBuildMetadataMap = Object.freeze({
  test: Object.freeze({
  "buildMetadataSchemaVersion": 1,
  "evidenceSchemaVersion": 1,
  "providerCode": "paytr_iframe",
  "capability": "payment_processing",
  "environment": "test",
  "adapterVersion": 1,
  "gitSha": "850cf82d441a02d079c41f7969d9e10ea7da2f49",
  "sourceDigest": "sha256:07b8bd8d8324dfee9effd013f2b4278296807d4d9368f4510d8727c610c93fc6",
  "candidateExecutionDigest": "sha256:95282d83f2323514937be5255873c9ebe418cac608972911163a4e45c2686eb1"
}),
  live: Object.freeze({
  "buildMetadataSchemaVersion": 1,
  "evidenceSchemaVersion": 1,
  "providerCode": "paytr_iframe",
  "capability": "payment_processing",
  "environment": "live",
  "adapterVersion": 1,
  "gitSha": "850cf82d441a02d079c41f7969d9e10ea7da2f49",
  "sourceDigest": "sha256:07b8bd8d8324dfee9effd013f2b4278296807d4d9368f4510d8727c610c93fc6",
  "candidateExecutionDigest": "sha256:86c278a14f64b548ddf0807f3b35d5a0188901bcaf31f03885181715973b1e4b"
}),
});

export const PAYTR_GENERATED_APPROVED_EXECUTION_AUTHORITIES: PaytrExecutionAuthorityMap = Object.freeze({
  test: Object.freeze({
  "environment": "test",
  "adapterVersion": 1,
  "evidenceDigest": "sha256:95282d83f2323514937be5255873c9ebe418cac608972911163a4e45c2686eb1"
}),
  live: Object.freeze({
  "environment": "live",
  "adapterVersion": 1,
  "evidenceDigest": "sha256:86c278a14f64b548ddf0807f3b35d5a0188901bcaf31f03885181715973b1e4b"
}),
});
