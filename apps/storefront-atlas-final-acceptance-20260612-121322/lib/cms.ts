import { CmsPage } from "@/types/cms";

export const CMS_PAGES: CmsPage[] = [];

export function getCmsPages(): CmsPage[] {
    return [...CMS_PAGES].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
}

export function getCmsPageBySlug(slug: string): CmsPage | undefined {
    return CMS_PAGES.find(p => p.slug === slug);
}
