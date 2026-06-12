// SEO Hub - MDX Content Reader & Parser
import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import readingTime from 'reading-time';
import type { MDXContent, MDXFrontmatter } from './seo-hub-types';

// Content root directory
const CONTENT_DIR = path.join(process.cwd(), 'content', 'seo');

/**
 * MDX dosyasından frontmatter ve içerik okur
 */
export async function getMDXContent(
  filePath: string
): Promise<MDXContent> {
  try {
    const fullPath = path.join(CONTENT_DIR, `${filePath}.mdx`);

    // Dosya kontrolü
    if (!fs.existsSync(fullPath)) {
      throw new Error(`MDX file not found: ${fullPath}`);
    }

    const fileContents = fs.readFileSync(fullPath, 'utf8');
    const { data, content } = matter(fileContents);

    // Reading time hesapla (eğer frontmatter'da yoksa)
    const stats = readingTime(content);
    const wordCount = stats.words;

    // Headings çıkar
    const headings = extractHeadings(content);

    // Frontmatter tip kontrolü ve varsayılan değerler
    const frontmatter: MDXFrontmatter = {
      title: data.title || 'Başlık Yok',
      description: data.description || '',
      primaryKeyword: data.primaryKeyword || data.title || '',
      secondaryKeywords: data.secondaryKeywords || [],
      searchIntent: data.searchIntent || 'informational',
      publishedAt: data.publishedAt || new Date().toISOString(),
      updatedAt: data.updatedAt || data.publishedAt || new Date().toISOString(),
      readingTime: data.readingTime || Math.ceil(stats.minutes),
      wordCount: data.wordCount || wordCount,
      pillarTitle: data.pillarTitle,
      relatedClusters: data.relatedClusters || [],
      faq: data.faq || [],
    };

    return {
      frontmatter,
      content,
      headings,
    };
  } catch (error) {
    console.error(`Error reading MDX file: ${filePath}`, error);
    throw error;
  }
}

/**
 * Markdown içinden başlıkları (headings) çıkarır
 */
export function extractHeadings(
  content: string
): Array<{ id: string; text: string; level: number }> {
  const headingRegex = /^(#{1,3})\s+(.+)$/gm;
  const headings: Array<{ id: string; text: string; level: number }> = [];
  let match;

  while ((match = headingRegex.exec(content)) !== null) {
    const level = match[1].length;
    const text = match[2].trim();
    const id = text
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();

    headings.push({ id, text, level });
  }

  return headings;
}

/**
 * Tüm pillar slug'larını döndürür (static params için)
 */
export async function getAllPillarSlugs(): Promise<string[]> {
  try {
    const pillarsDir = path.join(CONTENT_DIR);

    if (!fs.existsSync(pillarsDir)) {
      return [];
    }

    const entries = fs.readdirSync(pillarsDir, { withFileTypes: true });
    const slugs = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter((slug) => slug !== '_shared'); // _shared klasörünü hariç tut

    return slugs;
  } catch (error) {
    console.error('Error reading pillar slugs:', error);
    return [];
  }
}

/**
 * Belirli bir pillar altındaki tüm cluster slug'larını döndürür
 */
export async function getClusterSlugsByPillar(
  pillarSlug: string
): Promise<string[]> {
  try {
    const pillarDir = path.join(CONTENT_DIR, pillarSlug);

    if (!fs.existsSync(pillarDir)) {
      return [];
    }

    const entries = fs.readdirSync(pillarDir, { withFileTypes: true });
    const slugs = entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.mdx'))
      .filter((entry) => entry.name !== 'index.mdx') // index pillar sayfasıdır
      .map((entry) => entry.name.replace('.mdx', ''));

    return slugs;
  } catch (error) {
    console.error(`Error reading cluster slugs for pillar ${pillarSlug}:`, error);
    return [];
  }
}

/**
 * Tüm published içerik yollarını listeler (sitemap için)
 */
export async function getAllPublishedContentPaths(): Promise<
  Array<{
    path: string;
    lastmod: string;
  }>
> {
  const paths: Array<{ path: string; lastmod: string }> = [];

  try {
    const pillarSlugs = await getAllPillarSlugs();

    for (const pillarSlug of pillarSlugs) {
      // Pillar sayfası
      try {
        const pillarPath = path.join(CONTENT_DIR, pillarSlug, 'index.mdx');
        if (fs.existsSync(pillarPath)) {
          const { data } = matter(fs.readFileSync(pillarPath, 'utf8'));
          paths.push({
            path: `/seo/${pillarSlug}`,
            lastmod: data.updatedAt || data.publishedAt || new Date().toISOString(),
          });
        }

        // Cluster sayfaları
        const clusterSlugs = await getClusterSlugsByPillar(pillarSlug);
        for (const clusterSlug of clusterSlugs) {
          try {
            const clusterPath = path.join(CONTENT_DIR, pillarSlug, `${clusterSlug}.mdx`);
            const { data } = matter(fs.readFileSync(clusterPath, 'utf8'));

            // Sadece published içerikleri ekle
            if (data.status === 'published') {
              paths.push({
                path: `/seo/${pillarSlug}/${clusterSlug}`,
                lastmod: data.updatedAt || data.publishedAt || new Date().toISOString(),
              });
            }
          } catch (error) {
            console.error(`Error reading cluster ${clusterSlug}:`, error);
          }
        }
      } catch (error) {
        console.error(`Error reading pillar ${pillarSlug}:`, error);
      }
    }
  } catch (error) {
    console.error('Error getting all published content paths:', error);
  }

  return paths;
}

/**
 * İlgili içerikleri önerir
 */
export async function getRelatedClusters(
  currentPillar: string,
  currentCluster: string,
  relatedSlugs: string[] = []
): Promise<
  Array<{
    pillar: string;
    cluster: string;
    title: string;
    description: string;
  }>
> {
  const related: Array<{
    pillar: string;
    cluster: string;
    title: string;
    description: string;
  }> = [];

  for (const slug of relatedSlugs) {
    try {
      const [pillar, cluster] = slug.split('/');
      const content = await getMDXContent(slug);

      // Mevcut sayfayı hariç tut
      if (pillar === currentPillar && cluster === currentCluster) {
        continue;
      }

      related.push({
        pillar,
        cluster,
        title: content.frontmatter.title,
        description: content.frontmatter.description,
      });
    } catch (error) {
      console.error(`Error reading related content ${slug}:`, error);
    }
  }

  return related.slice(0, 4); // Max 4 ilgili içerik
}
