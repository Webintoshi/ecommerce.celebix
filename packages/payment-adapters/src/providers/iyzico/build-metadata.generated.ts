import type { IyzicoCandidateBuildMetadata } from "./build-binding.ts";

// A build may replace this with a verified candidate metadata literal. It is
// deliberately not an execution authority and remains null in source control.
export const IYZICO_GENERATED_BUILD_METADATA:
  IyzicoCandidateBuildMetadata | null = null;
