export type MerchantContentKind = 'blog_post' | 'page';
export type MerchantContentField = 'name' | 'body' | 'excerpt' | 'seoTitle' | 'seoDescription';
export type MerchantContentOrigins = Readonly<Partial<Record<MerchantContentField, Readonly<{
    generationId: string;
    state: 'ai' | 'edited_ai';
}> | Readonly<{
    state: 'manual';
}>>>>;
export type MerchantContentValues = Readonly<{
    name: string;
    slug: string;
    locale: string;
    body: string;
    excerpt: string | null;
    seoTitle: string | null;
    seoDescription: string | null;
    published: boolean;
    status: 'draft' | 'active';
}>;
export type MerchantContentDocument = Readonly<Omit<MerchantContentValues, 'status'> & {
    id: string;
    kind: MerchantContentKind;
    status: 'draft' | 'active' | 'archived';
    version: number;
    publishedAt: string | null;
    createdAt: string;
    updatedAt: string;
    bodyFormat: 'legacy' | 'normalized_html';
    bodyDigest: string;
    origins: MerchantContentOrigins;
}>;
export type SaveMerchantContentRequest = Readonly<{
    draftId: string;
    recordId: string | null;
    expectedVersion: number | null;
    expectedBodyDigest: string | null;
    kind: MerchantContentKind;
    bodyAction: 'replace' | 'preserve';
    values: MerchantContentValues;
    origins: MerchantContentOrigins;
}>;
export type MerchantContentVersion = Readonly<{
    recordId: string;
    kind: MerchantContentKind;
    version: number;
    values: Readonly<Omit<MerchantContentValues, 'status'>>;
    status: 'draft' | 'active' | 'archived';
    bodyFormat: 'legacy' | 'normalized_html';
    origins: MerchantContentOrigins;
    savedAt: string;
}>;
