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
  "gitSha": "03f81a1eb1e2546e155a4cce7a822ca3dcf19234",
  "sourceDigest": "sha256:62b40646294b75d99c3c53e1da7ffd3738398c7846afe277f3b6bfd4e41e2940",
  "candidateExecutionDigest": "sha256:31cb07156978753ba74459c9bbef58811d22b4eb0272f5704f5b6f2698aca61c"
}),
  live: Object.freeze({
  "buildMetadataSchemaVersion": 1,
  "evidenceSchemaVersion": 1,
  "providerCode": "paytr_iframe",
  "capability": "payment_processing",
  "environment": "live",
  "adapterVersion": 1,
  "gitSha": "03f81a1eb1e2546e155a4cce7a822ca3dcf19234",
  "sourceDigest": "sha256:62b40646294b75d99c3c53e1da7ffd3738398c7846afe277f3b6bfd4e41e2940",
  "candidateExecutionDigest": "sha256:131f1c598933cc43cb25b482e4162eda753ee3388b20328d0bb9b9ea6f2d5ef8"
}),
});

export const PAYTR_GENERATED_APPROVED_EXECUTION_AUTHORITIES: PaytrExecutionAuthorityMap = Object.freeze({
  test: Object.freeze({
  "environment": "test",
  "adapterVersion": 1,
  "evidenceDigest": "sha256:31cb07156978753ba74459c9bbef58811d22b4eb0272f5704f5b6f2698aca61c"
}),
  live: Object.freeze({
  "environment": "live",
  "adapterVersion": 1,
  "evidenceDigest": "sha256:131f1c598933cc43cb25b482e4162eda753ee3388b20328d0bb9b9ea6f2d5ef8"
}),
});
