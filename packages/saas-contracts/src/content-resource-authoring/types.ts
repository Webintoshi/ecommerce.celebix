import type { MerchantContentField, MerchantContentKind, MerchantContentValues } from '../merchant-content/types.ts';
export interface ContentResourceTarget {
    readonly kind: MerchantContentKind;
    readonly draftId: string;
    readonly recordId: string | null;
    readonly recordVersion: number | null;
}
export interface ContentOutline {
    readonly title: string;
    readonly sections: readonly Readonly<{
        heading: string;
        points: readonly string[];
    }>[];
}
export interface ContentResourceRequestBase {
    readonly target: ContentResourceTarget;
    readonly currentDraft: MerchantContentValues;
    readonly locale: string;
    readonly tone: 'neutral' | 'friendly' | 'professional';
    readonly brandVoice?: string | null;
    readonly length: 'short' | 'medium' | 'long';
    readonly note: string;
    readonly researchOperationId: string | null;
}
export type ContentResourceAuthoringRequest = (ContentResourceRequestBase & Readonly<{
    stage: 'outline';
    topic: string;
    purpose: string;
}>) | (ContentResourceRequestBase & Readonly<{
    stage: 'draft';
    action: 'article' | 'improve' | 'shorten' | 'rewrite_selection' | 'seo';
    fields: readonly MerchantContentField[];
    reviewedOutline: ContentOutline | null;
    outlineGenerationId: string | null;
    selection: Readonly<{
        field: 'body';
        text: string;
    }> | null;
}>);
export interface ContentCitation {
    readonly field: MerchantContentField;
    readonly sourceId: string;
    readonly quote: string;
}
/** Rendered safe field values; provider block/grounding validation precedes this durable shape. */
export interface ContentResourceDraft {
    readonly sourceFingerprint: string;
    readonly values: Readonly<Partial<Pick<MerchantContentValues, MerchantContentField>>>;
    readonly citations: readonly ContentCitation[];
    readonly suggestions: readonly string[];
}
export interface ContentResourceUsage {
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly totalTokens: number;
}
export interface ContentResourceGenerationView {
    readonly id: string;
    readonly target: ContentResourceTarget;
    readonly stage: 'outline' | 'draft';
    readonly status: 'pending' | 'completed' | 'failed' | 'unknown';
    readonly outline: ContentOutline | null;
    readonly draft: ContentResourceDraft | null;
    readonly sourceFingerprint: string;
    readonly usage: ContentResourceUsage | null;
    readonly safeCode: string | null;
    readonly createdAt: string;
    readonly updatedAt: string;
    readonly finishedAt: string | null;
}
export interface ContentResourceGeneration extends ContentResourceGenerationView {
    readonly requestFingerprint: string;
    readonly configId: string;
    readonly provider: string;
    readonly model: string;
    readonly credentialVersion: number;
    readonly promptVersion: string;
    readonly version: number;
    readonly dispatchState: 'not_dispatched' | 'dispatched' | 'unknown';
    readonly claimToken: string | null;
    readonly leaseExpiresAt: string | null;
}
