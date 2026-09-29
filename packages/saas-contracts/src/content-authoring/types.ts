import type { ProductMeasurements } from "../catalog/types.ts";
export type ContentAuthoringField = "description" | "seoTitle" | "seoDescription";
export interface ContentAuthoringAttribute {
    readonly attributeId: string;
    readonly value: string;
}
export interface ContentAuthoringVariant {
    readonly id?: string;
    readonly title: string;
    readonly attributes?: readonly ContentAuthoringAttribute[];
    readonly measurements?: ProductMeasurements | null;
}
/** Full snapshot: omitted information is unknown; empty/null explicitly clears it. Neither restores saved values. */
export interface ContentAuthoringProductSnapshot {
    readonly title: string;
    readonly description?: string | null;
    readonly seoTitle?: string | null;
    readonly seoDescription?: string | null;
    readonly categoryIds?: readonly string[];
    readonly brandId?: string | null;
    readonly attributes?: readonly ContentAuthoringAttribute[];
    readonly variants?: readonly ContentAuthoringVariant[];
    readonly measurements?: ProductMeasurements | null;
}
export interface ContentAuthoringRequest {
    readonly draftId: string;
    readonly productId: string | null;
    readonly productVersion: number | null;
    readonly profileVersion: number | null;
    readonly currentDraft: ContentAuthoringProductSnapshot;
    readonly action: "create" | "improve" | "shorten" | "rewrite_selection";
    readonly fields: readonly ContentAuthoringField[];
    readonly locale: string;
    readonly tone: "neutral" | "friendly" | "professional";
    /** Untrusted store writing style; never a source of product facts. */
    readonly brandVoice?: string | null;
    readonly length: "short" | "medium" | "long";
    readonly note: string;
    readonly selection: Readonly<{
        field: ContentAuthoringField;
        text: string;
    }> | null;
}
export interface ProductFact {
    readonly ref: string;
    readonly field: string;
    readonly value: string;
    readonly unit?: string;
    readonly scope: "product" | "variant";
    readonly variantId?: string;
    readonly source: "current_draft" | "tenant_reference";
}
/** Internal server-built exact source group; never ordinary fact authority. */
export interface ProductSourcePreservation {
    readonly sourceHash: string;
    readonly textHash: string;
    readonly text: string;
    readonly clauses: readonly Readonly<{ref:string;value:string;ordinal:number;start:number;end:number}>[];
}
export interface ProductFactPacket {
    readonly title: string;
    readonly facts: readonly ProductFact[];
    readonly sourcePreservation?: ProductSourcePreservation;
    readonly sourceFingerprint: string;
}
export type ContentAuthoringTextNode = Readonly<{
    type: "text";
    text: string;
}> | Readonly<{
    type: "fact";
    factRef: string;
    value: string;
    unit?: string;
}>;
export type ContentAuthoringBlock = Readonly<{
    type: "paragraph";
    children: readonly ContentAuthoringTextNode[];
}> | Readonly<{
    type: "heading";
    level: 2 | 3 | 4;
    children: readonly ContentAuthoringTextNode[];
}> | Readonly<{
    type: "list";
    ordered: boolean;
    items: readonly (readonly ContentAuthoringTextNode[])[];
}> | Readonly<{
    type: "table";
    rows: readonly (readonly (readonly ContentAuthoringTextNode[])[])[];
}>;
export interface ContentAuthoringClaim {
    readonly field: ContentAuthoringField;
    readonly factRef: string;
    readonly value: string;
    readonly unit?: string;
}
export interface ContentAuthoringDraft {
    readonly description?: readonly ContentAuthoringBlock[];
    readonly seoTitle?: string;
    readonly seoDescription?: string;
    readonly suggestions: readonly string[];
    readonly claims: readonly ContentAuthoringClaim[];
    readonly sourceFingerprint: string;
}
export interface ContentGenerationView {
 readonly id: string; readonly draftId: string; readonly productId: string | null;
 readonly status: 'pending' | 'completed' | 'failed' | 'unknown'; readonly draft: ContentAuthoringDraft | null;
 readonly sourceFingerprint: string;
 readonly usage: Readonly<{inputTokens:number;outputTokens:number;totalTokens:number}> | null;
 readonly safeCode: string | null; readonly createdAt: string; readonly updatedAt: string; readonly finishedAt: string | null;
}

/** Private normal-save references; hashes and origin classification are server derived. */
export type ContentAuthoringFieldOriginInput = Readonly<{ generationId: string; draftId: string }>;
export type ContentAuthoringFieldOriginsInput = Readonly<Partial<Record<ContentAuthoringField, ContentAuthoringFieldOriginInput | null>>>;
