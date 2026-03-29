// SEO Hub - Cluster Sayfası
import { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getAllPillarSlugs, getClusterSlugsByPillar, getMDXContent, getRelatedClusters } from '@/lib/seo-content';
import { MDXRemote } from 'next-mdx-remote/rsc';
import { generateBreadcrumbSchema, generateArticleSchema, generateFAQSchema } from '@/lib/seo-schema';

// ISR - Her saat başı güncelle
export const revalidate = 3600;

// Static params generation
export async function generateStaticParams() {
  const params: Array<{ pillar: string; cluster: string }> = [];

  const pillarSlugs = await getAllPillarSlugs();

  for (const pillarSlug of pillarSlugs) {
    const clusterSlugs = await getClusterSlugsByPillar(pillarSlug);
    for (const clusterSlug of clusterSlugs) {
      params.push({ pillar: pillarSlug, cluster: clusterSlug });
    }
  }

  return params;
}

// Metadata generation
export async function generateMetadata({
  params,
}: {
  params: { pillar: string; cluster: string };
}): Promise<Metadata> {
  try {
    const { frontmatter } = await getMDXContent(`${params.pillar}/${params.cluster}`);

    return {
      title: frontmatter.title,
      description: frontmatter.description,
      alternates: {
        canonical: `/seo/${params.pillar}/${params.cluster}`,
      },
      openGraph: {
        title: frontmatter.title,
        description: frontmatter.description,
        type: 'article',
        publishedTime: frontmatter.publishedAt,
        modifiedTime: frontmatter.updatedAt,
        url: `/seo/${params.pillar}/${params.cluster}`,
      },
    };
  } catch {
    return {
      title: 'SEO Rehberi',
    };
  }
}

export default async function ClusterPage({
  params,
}: {
  params: { pillar: string; cluster: string };
}) {
  try {
    const clusterContent = await getMDXContent(`${params.pillar}/${params.cluster}`);
    const pillarContent = await getMDXContent(`${params.pillar}/index`);

    // İlgili içerikleri al
    const relatedContent = await getRelatedClusters(
      params.pillar,
      params.cluster,
      clusterContent.frontmatter.relatedClusters
    );

    // Breadcrumb items
    const breadcrumbItems = [
      { label: 'SEO', href: '/seo' },
      { label: pillarContent.frontmatter.title, href: `/seo/${params.pillar}` },
      { label: clusterContent.frontmatter.title, href: `#` },
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
              generateArticleSchema(clusterContent.frontmatter, params.pillar, params.cluster)
            ),
          }}
        />
        {clusterContent.frontmatter.faq && clusterContent.frontmatter.faq.length > 0 && (
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{
              __html: JSON.stringify(generateFAQSchema(clusterContent.frontmatter.faq)),
            }}
          />
        )}

        <article className="min-h-screen bg-gray-50 dark:bg-gray-900">
          {/* Breadcrumb */}
          <nav className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
              <ol className="flex items-center space-x-2 text-sm">
                <li>
                  <Link href="/seo" className="text-indigo-600 dark:text-indigo-400 hover:underline">
                    SEO
                  </Link>
                </li>
                <li className="text-gray-400">/</li>
                <li>
                  <Link
                    href={`/seo/${params.pillar}`}
                    className="text-indigo-600 dark:text-indigo-400 hover:underline"
                  >
                    {pillarContent.frontmatter.title}
                  </Link>
                </li>
                <li className="text-gray-400">/</li>
                <li className="text-gray-600 dark:text-gray-400 truncate max-w-[200px]">
                  {clusterContent.frontmatter.title}
                </li>
              </ol>
            </div>
          </nav>

          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
            <div className="lg:grid lg:grid-cols-[1fr_300px] lg:gap-8">
              {/* Main Content */}
              <div className="lg:col-span-1">
                {/* Article Header */}
                <header className="mb-8">
                  <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 dark:text-white mb-4">
                    {clusterContent.frontmatter.title}
                  </h1>

                  <p className="text-xl text-gray-600 dark:text-gray-400 mb-6">
                    {clusterContent.frontmatter.description}
                  </p>

                  {/* Meta Info */}
                  <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500 dark:text-gray-500">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">⏱️</span>
                      <span>{clusterContent.frontmatter.readingTime} dakika okuma</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xl">📝</span>
                      <span>{clusterContent.frontmatter.wordCount} kelime</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xl">📅</span>
                      <span>
                        Güncelleme:{' '}
                        {new Date(clusterContent.frontmatter.updatedAt || '').toLocaleDateString('tr-TR')}
                      </span>
                    </div>
                  </div>

                  {/* Primary Keyword Badge */}
                  {clusterContent.frontmatter.primaryKeyword && (
                    <div className="mt-4">
                      <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-indigo-100 dark:bg-indigo-900/30 text-indigo-800 dark:text-indigo-300">
                        Hedef: {clusterContent.frontmatter.primaryKeyword}
                      </span>
                    </div>
                  )}
                </header>

                {/* Key Takeaways - GEO için kritik */}
                {clusterContent.frontmatter.keyTakeaways && (
                  <div className="bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 rounded-xl p-6 mb-8 border border-indigo-100 dark:border-indigo-900/30">
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                      <span className="text-2xl">💡</span>
                      Önemli Çıkarımlar
                    </h2>
                    <ul className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
                      {clusterContent.frontmatter.keyTakeaways.map((takeaway: string, i: number) => (
                        <li key={i} className="flex items-start gap-2">
                          <span className="text-indigo-600 dark:text-indigo-400 mt-0.5">✓</span>
                          <span>{takeaway}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* MDX Content */}
                <div className="prose prose-lg dark:prose-invert max-w-none">
                  <MDXRemote source={clusterContent.content} />
                </div>

                {/* FAQ Section */}
                {clusterContent.frontmatter.faq && clusterContent.frontmatter.faq.length > 0 && (
                  <section className="mt-12">
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
                      Sıkça Sorulan Sorular
                    </h2>
                    <div className="space-y-4">
                      {clusterContent.frontmatter.faq.map((faq, i) => (
                        <details
                          key={i}
                          className="group bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
                        >
                          <summary className="flex cursor-pointer items-center justify-between p-4 font-medium text-gray-900 dark:text-white">
                            {faq.question}
                            <span className="ml-4 transition group-open:rotate-180">
                              <svg
                                fill="none"
                                height="24"
                                shapeRendering="geometricPrecision"
                                stroke="currentColor"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth="1.5"
                                viewBox="0 0 24 24"
                                width="24"
                              >
                                <path d="M6 9l6 6 6-6"></path>
                              </svg>
                            </span>
                          </summary>
                          <div className="px-4 pb-4 text-sm text-gray-600 dark:text-gray-400">
                            {faq.answer}
                          </div>
                        </details>
                      ))}
                    </div>
                  </section>
                )}

                {/* Related Articles */}
                {relatedContent.length > 0 && (
                  <section className="mt-12">
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
                      İlgili Rehberler
                    </h2>
                    <div className="grid md:grid-cols-2 gap-6">
                      {relatedContent.map((related) => (
                        <Link
                          key={`${related.pillar}/${related.cluster}`}
                          href={`/seo/${related.pillar}/${related.cluster}`}
                          className="group block bg-white dark:bg-gray-800 rounded-xl p-6 hover:shadow-lg transition-shadow border border-gray-200 dark:border-gray-700"
                        >
                          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                            {related.title}
                          </h3>
                          <p className="text-gray-600 dark:text-gray-400 text-sm line-clamp-2">
                            {related.description}
                          </p>
                        </Link>
                      ))}
                    </div>
                  </section>
                )}
              </div>

              {/* Sidebar - Table of Contents */}
              <aside className="hidden lg:block">
                <div className="lg:sticky lg:top-20">
                  {/* Table of Contents */}
                  {clusterContent.headings && clusterContent.headings.length > 0 && (
                    <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700 mb-6">
                      <h3 className="font-semibold text-gray-900 dark:text-white mb-4">
                        İçindekiler
                      </h3>
                      <nav className="space-y-2">
                        {clusterContent.headings.map((heading) => (
                          <a
                            key={heading.id}
                            href={`#${heading.id}`}
                            className={`block text-sm hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors ${
                              heading.level === 1
                                ? 'font-medium text-gray-900 dark:text-white'
                                : heading.level === 2
                                ? 'text-gray-700 dark:text-gray-300 pl-3'
                                : 'text-gray-600 dark:text-gray-400 pl-6'
                            }`}
                          >
                            {heading.text}
                          </a>
                        ))}
                      </nav>
                    </div>
                  )}

                  {/* Back to Pillar */}
                  <Link
                    href={`/seo/${params.pillar}`}
                    className="block bg-indigo-600 hover:bg-indigo-700 text-white text-center rounded-xl p-4 transition-colors font-medium"
                  >
                    ← {pillarContent.frontmatter.title}'e Dön
                  </Link>
                </div>
              </aside>
            </div>
          </div>
        </article>
      </>
    );
  } catch (error) {
    console.error(`Error loading cluster page: ${params.pillar}/${params.cluster}`, error);
    notFound();
  }
}
