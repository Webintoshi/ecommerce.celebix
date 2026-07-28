import type { CatalogOnboardingResult, CatalogProductEditorProjection } from "@celebix/saas-contracts";

const SAFE_MEDIA_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_MEDIA_BYTES = 5_242_880;
const MAX_MEDIA_COUNT = 16;
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;

export type ProductMediaSelection = Readonly<{ file: File; altText: string }>;

export type ProductMediaCompletionOutcome =
  | Readonly<{ kind: "draft"; result: CatalogOnboardingResult; uploadedCount: number }>
  | Readonly<{ kind: "published"; result: CatalogOnboardingResult }>
  | Readonly<{ kind: "published_recovered"; projection: CatalogProductEditorProjection }>
  | Readonly<{ kind: "draft_media_failed"; result: CatalogOnboardingResult; uploadedCount: number }>
  | Readonly<{ kind: "completion_unknown"; result: CatalogOnboardingResult; expectedMediaCount: number }>;

export type ProductMediaCompletionInput = Readonly<{
  result: CatalogOnboardingResult;
  files: readonly ProductMediaSelection[];
  publish: boolean;
  upload(productId: string, input: Readonly<{ file: File; altText: string; onProgress(value: number): void }>): Promise<unknown>;
  complete(productId: string, input: Readonly<{ expectedProductVersion: number; expectedMediaCount: number }>): Promise<CatalogOnboardingResult>;
  recover(productId: string): Promise<CatalogProductEditorProjection>;
  onProgress?(input: Readonly<{ index: number; count: number; value: number }>): void;
}>;

function validateFiles(files: readonly ProductMediaSelection[]): void {
  if (!Array.isArray(files) || files.length > MAX_MEDIA_COUNT) throw new TypeError("catalog_onboarding_media_invalid");
  for (const selected of files) {
    if (
      typeof selected !== "object" || selected === null
      || !(selected.file instanceof File)
      || !SAFE_MEDIA_TYPES.has(selected.file.type)
      || selected.file.size < 1 || selected.file.size > MAX_MEDIA_BYTES
      || typeof selected.altText !== "string"
      || selected.altText !== selected.altText.trim()
      || selected.altText.length > 500
      || CONTROL.test(selected.altText)
    ) throw new TypeError("catalog_onboarding_media_invalid");
  }
}

export async function completeProductMedia(input: ProductMediaCompletionInput): Promise<ProductMediaCompletionOutcome> {
  validateFiles(input.files);
  let uploadedCount = 0;
  for (const [index, selected] of input.files.entries()) {
    try {
      await input.upload(input.result.product.id, {
        file: selected.file,
        altText: selected.altText,
        onProgress: (value) => input.onProgress?.(Object.freeze({ index, count: input.files.length, value })),
      });
      uploadedCount += 1;
    } catch {
      return Object.freeze({ kind: "draft_media_failed", result: input.result, uploadedCount });
    }
  }
  if (!input.publish) return Object.freeze({ kind: "draft", result: input.result, uploadedCount });

  const expectedMediaCount = input.result.mediaCount + input.files.length;
  try {
    return Object.freeze({ kind: "published", result: await input.complete(input.result.product.id, {
      expectedProductVersion: input.result.product.version,
      expectedMediaCount,
    }) });
  } catch {
    try {
      const projection = await input.recover(input.result.product.id);
      if (projection.product.status === "active" && projection.mediaCount === expectedMediaCount) {
        return Object.freeze({ kind: "published_recovered", projection });
      }
    } catch {
      // A single read-only recovery is the final authority check. No write is retried.
    }
    return Object.freeze({ kind: "completion_unknown", result: input.result, expectedMediaCount });
  }
}
