// SEO Hub - Dinamik Sitemap
import { MetadataRoute } from 'next';
import { getAllPublishedContentPaths } from '@/lib/seo-content';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://deri-kordon.test';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Static pages
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: SITE_URL,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1,
    },
    {
      url: `${SITE_URL}/seo`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/blog`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.8,
    },
  ];

  // SEO Hub iÃ§erik sayfalarÄ±
  const contentPaths = await getAllPublishedContentPaths();

  const contentPages: MetadataRoute.Sitemap = contentPaths.map((path) => ({
    url: `${SITE_URL}${path.path}`,
    lastModified: new Date(path.lastmod),
    changeFrequency: path.path.includes('/seo/') ? 'weekly' as const : 'monthly' as const,
    priority: path.path.split('/').length === 3 ? 0.8 : 0.7, // Pillar > Cluster
  }));

  return [...staticPages, ...contentPages];
}

