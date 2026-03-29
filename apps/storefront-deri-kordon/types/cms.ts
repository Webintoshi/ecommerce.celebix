export interface CmsPage {
    id: string;
    title: string;
    slug: string;
    content: string;
    status: "published" | "draft" | "archived";
    metaTitle?: string;
    metaDescription?: string;
    updatedAt: Date;
    publishedAt?: Date;
}

export interface CmsPageFormData {
    title: string;
    slug: string;
    content: string;
    status: "published" | "draft" | "archived";
    metaTitle: string;
    metaDescription: string;
}
