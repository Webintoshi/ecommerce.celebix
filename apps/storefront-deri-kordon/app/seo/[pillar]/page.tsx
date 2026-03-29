// SEO Hub - Pillar Sayfası
import { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getAllPillarSlugs, getClusterSlugsByPillar, getMDXContent } from '@/lib/seo-content';
import { MDXRemote } from 'next-mdx-remote/rsc';
import { generateBreadcrumbSchema, generateCollectionSchema } from '@/lib/seo-schema';

// ISR - Her saat başı güncelle
export const revalidate = 3600;

// Static params generation
export async function generateStaticParams() {
  const slugs = await getAllPillarSlugs();
  return slugs.map((slug) => ({ pillar: slug }));
}

// Metadata generation
export async function generateMetadata({ params }: { params: { pillar: string } }): Promise<Metadata> {
  try {
    const { frontmatter } = await getMDXContent(`${params.pillar}/index`);

    return {
      title: frontmatter.title,
      description: frontmatter.description,
      alternates: {
        canonical: `/seo/${params.pillar}`,
      },
      openGraph: {
        title: frontmatter.title,
        description: frontmatter.description,
        type: 'website',
        url: `/seo/${params.pillar}`,
      },
    };
  } catch {
    return {
      title: 'SEO Rehberi',
    };
  }
}

export default async function PillarPage({ params }: { params: { pillar: string } }) {
  try {
    const pillarContent = await getMDXContent(`${params.pillar}/index`);
    const clusterSlugs = await getClusterSlugsByPillar(params.pillar);

    // Cluster içeriklerini oku
    const clusters = await Promise.all(
      clusterSlugs.map(async (clusterSlug) => {
        try {
          const content = await getMDXContent(`${params.pillar}/${clusterSlug}`);
          return {
            slug: clusterSlug,
            title: content.frontmatter.title,
            description: content.frontmatter.description,
            readingTime: content.frontmatter.readingTime,
            wordCount: content.frontmatter.wordCount,
          };
        } catch {
          return null;
        }
      })
    );

    const validClusters = clusters.filter((c) => c !== null);

    // Breadcrumb items
    const breadcrumbItems = [
      { label: 'SEO', href: '/seo' },
      { label: pillarContent.frontmatter.title, href: `/seo/${params.pillar}` },
    ];

    return (
      <>
        {/* Schema.org JSON-LD */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(generateBreadcrumbSchema(breadcrumbItems)),
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(
              generateCollectionSchema(
                pillarContent.frontmatter.title,
                pillarContent.frontmatter.description,
                params.pillar,
                validClusters.map((c: any) => ({
                  title: c.title,
                  slug: c.slug,
                  description: c.description,
                }))
              )
            ),
          }}
        />

        <article className="min-h-screen">
          {/* Breadcrumb */}
          <nav className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
              <ol className="flex items-center space-x-2 text-sm">
                <li>
                  <Link
                    href="/seo"
                    className="text-indigo-600 dark:text-indigo-400 hover:underline"
                  >
                    SEO
                  </Link>
                </li>
                <li className="text-gray-400">/</li>
                <li className="text-gray-600 dark:text-gray-400">
                  {pillarContent.frontmatter.title}
                </li>
              </ol>
            </div>
          </nav>

          {/* Hero Section */}
          <header className="bg-gradient-to-br from-indigo-600 to-purple-600 text-white">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
              <div className="text-center">
                <div className="text-6xl mb-4">
                  {pillarContent.frontmatter.icon || '📚'}
                </div>
                <h1 className="text-4xl sm:text-5xl font-bold mb-4">
                  {pillarContent.frontmatter.title}
                </h1>
                <p className="text-xl text-indigo-100 max-w-3xl mx-auto">
                  {pillarContent.frontmatter.description}
                </p>
                <div className="flex justify-center items-center gap-6 mt-6 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">📝</span>
                    <span>{validClusters.length} Rehber</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">⏱️</span>
                    <span>{pillarContent.frontmatter.readingTime} dk okuma</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">📅</span>
                    <span>
                      {new Date(
                        pillarContent.frontmatter.updatedAt
                      ).toLocaleDateString('tr-TR')}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </header>

          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
            <div className="lg:grid lg:grid-cols-3 lg:gap-8">
              {/* Main Content */}
              <div className="lg:col-span-2">
                {/* Pillar Content */}
                <div className="prose prose-lg dark:prose-invert max-w-none mb-12">
                  <MDXRemote source={pillarContent.content} />
                </div>

                {/* Clusters Grid */}
                <section>
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
                    İlgili Rehberler
                  </h2>
                  <div className="grid md:grid-cols-2 gap-6">
                    {validClusters.map((cluster: any) => (
                      <Link
                        key={cluster.slug}
                        href={`/seo/${params.pillar}/${cluster.slug}`}
                        className="group block bg-gray-50 dark:bg-gray-800 rounded-xl p-6 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors border border-gray-200 dark:border-gray-700"
                      >
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                          {cluster.title}
                        </h3>
                        <p className="text-gray-600 dark:text-gray-400 text-sm mb-4 line-clamp-2">
                          {cluster.description}
                        </p>
                        <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-500">
                          <span className="flex items-center gap-1">
                            <span>⏱️</span>
                            <span>{cluster.readingTime} dk</span>
                          </span>
                          <span className="flex items-center gap-1">
                            <span>📝</span>
                            <span>{cluster.wordCount} kelime</span>
                          </span>
                        </div>
                      </Link>
                    ))}
                  </div>
                </section>
              </div>

              {/* Sidebar */}
              <aside className="lg:col-span-1">
                <div className="lg:sticky lg:top-20 space-y-6">
                  {/* Quick Navigation */}
                  <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
                    <h3 className="font-semibold text-gray-900 dark:text-white mb-4">
                      Hızlı Erişim
                    </h3>
                    <nav className="space-y-2">
                      <Link
                        href="/seo"
                        className="block text-sm text-gray-600 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400"
                      >
                        ← Tüm SEO Rehberleri
                      </Link>
                    </nav>
                  </div>

                  {/* Related Pillars */}
                  <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
                    <h3 className="font-semibold text-gray-900 dark:text-white mb-4">
                      Diğer Kategoriler
                    </h3>
                    <RelatedPillars currentPillar={params.pillar} />
                  </div>
                </div>
              </aside>
            </div>
          </div>
        </article>
      </>
    );
  } catch (error) {
    console.error(`Error loading pillar page: ${params.pillar}`, error);
    notFound();
  }
}

// Related Pillars Component
async function RelatedPillars({ currentPillar }: { currentPillar: string }) {
  const allSlugs = await getAllPillarSlugs();

  const relatedPillars = await Promise.all(
    allSlugs
      .filter((slug) => slug !== currentPillar)
      .slice(0, 5)
      .map(async (slug) => {
        try {
          const { frontmatter } = await getMDXContent(`${slug}/index`);
          return {
            slug,
            title: frontmatter.title,
            icon: frontmatter.icon,
          };
        } catch {
          return null;
        }
      })
  );

  const validPillars = relatedPillars.filter((p) => p !== null);

  return (
    <ul className="space-y-3">
      {validPillars.map((pillar: any) => (
        <li key={pillar.slug}>
          <Link
            href={`/seo/${pillar.slug}`}
            className="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
          >
            <span className="text-xl">{pillar.icon || '📚'}</span>
            <span>{pillar.title}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
