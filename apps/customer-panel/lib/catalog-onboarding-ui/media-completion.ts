import type { CatalogOnboardingResult, CatalogProductEditorProjection } from "@celebix/saas-contracts";

const SAFE_MEDIA_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_MEDIA_BYTES = 5_242_880;
const MAX_MEDIA_COUNT = 16;
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;

export type ProductMediaSelection = Readonly<{ localId?: string; file: File; altText: string }>;

export type ProductMediaCompletionState = Readonly<{ uploads: Readonly<Record<string, Readonly<{operationId:string;mediaId?:string}>>> }>;

export type ProductMediaCompletionOutcome =
  | Readonly<{ kind: "draft"; result: CatalogOnboardingResult; uploadedCount: number }>
  | Readonly<{ kind: "published"; result: CatalogOnboardingResult }>
  | Readonly<{ kind: "published_recovered"; projection: CatalogProductEditorProjection }>
  | Readonly<{ kind: "draft_media_failed"; result: CatalogOnboardingResult; uploadedCount: number }>
  | Readonly<{ kind: "draft_gallery_failed"; result: CatalogOnboardingResult; uploadedCount: number; error: string }>
  | Readonly<{ kind: "completion_unknown"; result: CatalogOnboardingResult; expectedMediaCount: number }>;

export type ProductMediaCompletionInput = Readonly<{
  result: CatalogOnboardingResult;
  files: readonly ProductMediaSelection[];
  publish: boolean;
  state?: ProductMediaCompletionState;
  onState?(state: ProductMediaCompletionState): void;
  assign?(mediaIdsByLocalId: Readonly<Record<string,string>>): Promise<void>;
  upload(productId: string, input: Readonly<{ file: File; altText: string; operationId?: string; onProgress(value: number): void }>): Promise<unknown>;
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
  let uploads = { ...input.state?.uploads };
  const resumable = input.state !== undefined;
  if (resumable && (input.files.some(item => !item.localId) || new Set(input.files.map(item => item.localId)).size !== input.files.length)) throw new TypeError("catalog_onboarding_media_invalid");
  function saveState() { input.onState?.(Object.freeze({uploads:Object.freeze({...uploads})})); }
  for (const [index, selected] of input.files.entries()) {
    if (selected.localId && uploads[selected.localId]?.mediaId) { uploadedCount++; continue; }
    const operationId = resumable ? uploads[selected.localId!]?.operationId ?? crypto.randomUUID() : undefined;
    if (selected.localId && operationId) { uploads[selected.localId] = Object.freeze({operationId}); saveState(); }
    try {
      const response = await input.upload(input.result.product.id, {
        file: selected.file,
        altText: selected.altText,
        ...(operationId ? {operationId} : {}),
        onProgress: (value) => input.onProgress?.(Object.freeze({ index, count: input.files.length, value })),
      });
      if (resumable) {
        const mediaId = (response as {media?:{id?:unknown}} | null)?.media?.id;
        if (typeof mediaId !== "string" || !mediaId) throw new TypeError("catalog_onboarding_media_id_missing");
        uploads[selected.localId!] = Object.freeze({operationId:operationId!,mediaId}); saveState();
      }
      uploadedCount += 1;
    } catch {
      return Object.freeze({ kind: "draft_media_failed", result: input.result, uploadedCount });
    }
  }
  if (input.assign) {
    try { await input.assign(Object.freeze(Object.fromEntries(Object.entries(uploads).flatMap(([key,value]) => value.mediaId ? [[key,value.mediaId]] : [])))); }
    catch (failure) { return Object.freeze({kind:"draft_gallery_failed",result:input.result,uploadedCount,error:failure instanceof Error?failure.message:"Varyant görselleri kaydedilemedi. Tekrar deneyin."}); }
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
