import type { PaymentProviderExecutionAuthority } from "@celebix/saas-contracts";

export type IyzicoCandidateBuildMetadata<Environment extends "test" | "live" = "test"> = Readonly<{
  buildMetadataSchemaVersion: 1;
  evidenceSchemaVersion: 1;
  providerCode: "iyzico_iframe";
  capability: "payment_processing";
  environment: Environment;
  adapterVersion: 1;
  gitSha: string;
  sourceDigest: string;
  candidateExecutionDigest: string;
}>;

// A build may replace this with a verified candidate metadata literal. It is
// deliberately not an execution authority and remains null in source control.
export const IYZICO_GENERATED_BUILD_METADATA:
  IyzicoCandidateBuildMetadata | null = null;

export const IYZICO_GENERATED_APPROVED_EXECUTION_AUTHORITY:
  Readonly<PaymentProviderExecutionAuthority> | null = null;


export const IYZICO_GENERATED_LIVE_BUILD_METADATA:
  IyzicoCandidateBuildMetadata<"live"> | null = null;

export const IYZICO_GENERATED_LIVE_APPROVED_EXECUTION_AUTHORITY:
  Readonly<PaymentProviderExecutionAuthority> | null = null;
