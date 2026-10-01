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
  "gitSha": "e8820fabc3849750e34ca8fd80bcb22e37512375",
  "sourceDigest": "sha256:1a07a5b9de71c42f2c13e55cdd1a4d9f7741f87883199222723708ac2ede800d",
  "candidateExecutionDigest": "sha256:8db1662008a60f0a963e381d20ad41f7b98f19811f63c7655500a0553a199914"
}),
  live: Object.freeze({
  "buildMetadataSchemaVersion": 1,
  "evidenceSchemaVersion": 1,
  "providerCode": "paytr_iframe",
  "capability": "payment_processing",
  "environment": "live",
  "adapterVersion": 1,
  "gitSha": "e8820fabc3849750e34ca8fd80bcb22e37512375",
  "sourceDigest": "sha256:1a07a5b9de71c42f2c13e55cdd1a4d9f7741f87883199222723708ac2ede800d",
  "candidateExecutionDigest": "sha256:47e53e7e71cd2cf70a91ea88dec929c2f37e81a96e606cb6f9ea37b6d142af07"
}),
});

export const PAYTR_GENERATED_APPROVED_EXECUTION_AUTHORITIES: PaytrExecutionAuthorityMap = Object.freeze({
  test: Object.freeze({
  "environment": "test",
  "adapterVersion": 1,
  "evidenceDigest": "sha256:b332fb0e51c6a4e340366507a8eace2aaed42482fb062f085c50576aff931c8f"
}),
  live: Object.freeze({
  "environment": "live",
  "adapterVersion": 1,
  "evidenceDigest": "sha256:14bbcbf73e0fbc41c3e4749b4dff59ce5a98df238e82becb2ddc503dea9abf2c"
}),
});
