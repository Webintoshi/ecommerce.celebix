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

// Source-control approved PayTR test iframe execution closure.
export const PAYTR_GENERATED_BUILD_METADATA: PaytrGeneratedBuildMetadataMap =
  Object.freeze({
    test: Object.freeze({
      buildMetadataSchemaVersion: 1,
      evidenceSchemaVersion: 1,
      providerCode: "paytr_iframe",
      capability: "payment_processing",
      environment: "test",
      adapterVersion: 1,
      gitSha: "1130d2c2b6cb1956c8492abab47007c459aea108",
      sourceDigest: "sha256:2ea1246f492435432fbb665d54f5ea1ba2595e09dcaba42e8e23587fb88cc448",
      candidateExecutionDigest: "sha256:5fed63cfbcd95ffc4c152ce0281bf364f8ec2e74ac095638c7580c5047a2bddb",
    }),
    live: null,
  });

export const PAYTR_GENERATED_APPROVED_EXECUTION_AUTHORITIES: PaytrExecutionAuthorityMap =
  Object.freeze({
    test: Object.freeze({
      environment: "test",
      adapterVersion: 1,
      evidenceDigest: "sha256:5fed63cfbcd95ffc4c152ce0281bf364f8ec2e74ac095638c7580c5047a2bddb",
    }),
    live: null,
  });
