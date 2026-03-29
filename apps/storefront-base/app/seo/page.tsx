// SEO Hub - Ana Sayfa
import { Metadata } from 'next';
import Link from 'next/link';
import { getAllPillarSlugs } from '@/lib/seo-content';
import { generateWebSiteSchema, generateOrganizationSchema, createJsonLd } from '@/lib/seo-schema';

export const metadata: Metadata = {
  title: 'SEO Rehberi 2026 | Topikal Otorite Hub',
  description: 'Kapsamlı SEO rehberleri. Teknik SEO, on-page optimizasyon, link building, e-ticaret SEO ve yapay zeka optimizasyonu (GEO) hakkında her şey.',
  alternates: {
    canonical: '/seo',
  },
  openGraph: {
    title: 'SEO Rehberi 2026 | Topikal Otorite Hub',
    description: 'SEO\'nın tüm dallarında kapsamlı rehberler ve güncel stratejiler.',
    type: 'website',
    url: '/seo',
  },
};

export default async function SEOHubPage() {
  const pillarSlugs = await getAllPillarSlugs();

  // Pillar verilerini MDX dosyalarından oku
  const pillars = await Promise.all(
    pillarSlugs.map(async (slug) => {
      try {
        const { frontmatter } = await getMDXContent(`${slug}/index`);
        return {
          slug,
          ...frontmatter,
        };
      } catch (error) {
        console.error(`Error loading pillar ${slug}:`, error);
        return null;
      }
    })
  );

  const validPillars = pillars.filter((p) => p !== null);

  return (
    <>
      {/* Schema.org JSON-LD */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(generateOrganizationSchema()),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(generateWebSiteSchema()),
        }}
      />

      <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white dark:from-gray-900 dark:to-gray-800">
        {/* Hero Section */}
        <section className="relative overflow-hidden bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-500 text-white">
          <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-10" />
          <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 lg:py-32">
            <div className="text-center">
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight mb-6">
                SEO Rehberi 2026
              </h1>
              <p className="text-xl sm:text-2xl text-indigo-100 max-w-3xl mx-auto mb-8">
                Topikal otorite kazanın, Google&apos;da üst sıralara çıkın ve
                yapay zeka motorlarında (GEO) görünür olun
              </p>
              <div className="flex flex-wrap justify-center gap-4 text-sm">
                <div className="flex items-center gap-2 bg-white/10 backdrop-blur-sm px-4 py-2 rounded-full">
                  <span className="text-2xl">📚</span>
                  <span>10+ Ana Kategori</span>
                </div>
                <div className="flex items-center gap-2 bg-white/10 backdrop-blur-sm px-4 py-2 rounded-full">
                  <span className="text-2xl">📝</span>
                  <span>40+ Derinlemesine Rehber</span>
                </div>
                <div className="flex items-center gap-2 bg-white/10 backdrop-blur-sm px-4 py-2 rounded-full">
                  <span className="text-2xl">🤖</span>
                  <span>GEO & AI Optimizasyonu</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* İçerik Grid */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
              Keşfetmeye Başla
            </h2>
            <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
              SEO&apos;nın tüm dallarında kapsamlı rehberler. Her kategori kendi
              içinde cluster içeriklere sahip.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {validPillars.map((pillar: any) => (
              <Link
                key={pillar.slug}
                href={`/seo/${pillar.slug}`}
                className="group relative overflow-hidden rounded-2xl bg-white dark:bg-gray-800 shadow-md hover:shadow-xl transition-all duration-300 border border-gray-200 dark:border-gray-700"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />

                <div className="relative p-6">
                  {/* Icon */}
                  <div className="text-4xl mb-4">{pillar.icon || '📚'}</div>

                  {/* Title */}
                  <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                    {pillar.title}
                  </h3>

                  {/* Description */}
                  <p className="text-gray-600 dark:text-gray-400 mb-4 line-clamp-2">
                    {pillar.description}
                  </p>

                  {/* Cluster Count */}
                  <div className="flex items-center text-sm text-indigo-600 dark:text-indigo-400 font-medium">
                    <span>Rehbere Git</span>
                    <svg
                      className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* Önemli Çıkarımlar - GEO için kritik */}
        <section className="bg-indigo-50 dark:bg-gray-800/50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
              💡 Önemli Çıkarımlar
            </h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              <div className="bg-white dark:bg-gray-800 p-6 rounded-xl">
                <h3 className="font-semibold text-gray-900 dark:text-white mb-2">
                  🎯 Topikal Otorite
                </h3>
                <p className="text-gray-600 dark:text-gray-400 text-sm">
                  Belirli bir alanda derinlemesine içerik üretin. Google&apos;da
                  otorite olmak için pillar-cluster yapısını kullanın.
                </p>
              </div>
              <div className="bg-white dark:bg-gray-800 p-6 rounded-xl">
                <h3 className="font-semibold text-gray-900 dark:text-white mb-2">
                  🤖 GEO Optimizasyonu
                </h3>
                <p className="text-gray-600 dark:text-gray-400 text-sm">
                  Yapay zeka motorlarında (Perplexity, ChatGPT) kaynak olarak
                  anılmak için yapısal veri ve özet içerikler kullanın.
                </p>
              </div>
              <div className="bg-white dark:bg-gray-800 p-6 rounded-xl">
                <h3 className="font-semibold text-gray-900 dark:text-white mb-2">
                  ⚡ Core Web Vitals
                </h3>
                <p className="text-gray-600 dark:text-gray-400 text-sm">
                  Sayfa hızı ve kullanıcı deneyimi sinyalleri 2026&apos;da daha
                  da önemli. LCP, INP ve CLS metriklerini optimize edin.
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
