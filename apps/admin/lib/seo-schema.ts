// SEO Hub - Schema.org Generator
import {
  SchemaArticle,
  SchemaBreadcrumb,
  SchemaFAQ,
  BreadcrumbItem,
  MDXFrontmatter,
} from './seo-hub-types';
import { STORE_RUNTIME } from "@/lib/store-runtime";

/**
 * Site ayarları (bunları environment variable'dan alabiliriz)
 */
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || STORE_RUNTIME.storefrontUrl;
const SITE_NAME = STORE_RUNTIME.name;
const AUTHOR_NAME = `${STORE_RUNTIME.name} SEO Team`;
const AUTHOR_URL = `${SITE_URL}/hakkimizda`;

/**
 * Article/TechArticle Schema oluşturur
 */
export function generateArticleSchema(
  frontmatter: MDXFrontmatter,
  pillarSlug: string,
  clusterSlug: string
): SchemaArticle {
  const url = `${SITE_URL}/seo/${pillarSlug}/${clusterSlug}`;

  return {
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    headline: frontmatter.title,
    description: frontmatter.description,
    datePublished: frontmatter.publishedAt,
    dateModified: frontmatter.updatedAt || frontmatter.publishedAt,
    author: {
      '@type': 'Person',
      name: AUTHOR_NAME,
      url: AUTHOR_URL,
    },
    publisher: {
      '@type': 'Organization',
      name: SITE_NAME,
      logo: {
        '@type': 'ImageObject',
        url: `${SITE_URL}/logo.png`,
      },
    },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': url,
    },
    about: {
      '@type': 'Thing',
      name: frontmatter.primaryKeyword,
    },
    keywords: [
      frontmatter.primaryKeyword,
      ...(frontmatter.secondaryKeywords || []),
    ].join(', '),
    wordCount: frontmatter.wordCount,
    timeRequired: frontmatter.readingTime
      ? `PT${frontmatter.readingTime}M`
      : undefined,
  };
}

/**
 * CollectionPage Schema (Pillar sayfaları için)
 */
export function generateCollectionSchema(
  title: string,
  description: string,
  pillarSlug: string,
  clusters: Array<{
    title: string;
    slug: string;
    description: string;
  }>
): Record<string, unknown> {
  const url = `${SITE_URL}/seo/${pillarSlug}`;

  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: title,
    description: description,
    url: url,
    about: {
      '@type': 'Thing',
      name: title,
    },
    hasPart: clusters.map((cluster) => ({
      '@type': 'TechArticle',
      name: cluster.title,
      description: cluster.description,
      url: `${SITE_URL}/seo/${pillarSlug}/${cluster.slug}`,
    })),
  };
}

/**
 * BreadcrumbList Schema oluşturur
 */
export function generateBreadcrumbSchema(
  items: BreadcrumbItem[]
): SchemaBreadcrumb {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.label,
      item: `${SITE_URL}${item.href}`,
    })),
  };
}

/**
 * FAQPage Schema oluşturur
 */
export function generateFAQSchema(
  faqs: Array<{ question: string; answer: string }>
): SchemaFAQ {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer,
      },
    })),
  };
}

/**
 * Organization Schema (Ana hub için)
 */
export function generateOrganizationSchema(): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE_NAME,
    url: SITE_URL,
    logo: {
      '@type': 'ImageObject',
      url: `${SITE_URL}/logo.png`,
    },
    description: 'SEO ve dijital pazarlama rehberleri',
    sameAs: [
      // Sosyal medya linklerini buraya ekleyin
      // 'https://twitter.com/celebix',
      // 'https://linkedin.com/company/celebix',
    ],
  };
}

/**
 * WebSite Schema (Site search için)
 */
export function generateWebSiteSchema(): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    url: SITE_URL,
    description: 'SEO ve dijital pazarlama rehberleri',
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${SITE_URL}/search?q={search_term_string}`,
      },
      'query-input': {
        '@type': 'PropertyValueSpecification',
        valueRequired: true,
        valueName: 'search_term_string',
      },
    },
  };
}

/**
 * JSON-LD script etiketi oluşturur (Next.js kullanımı için)
 */
export function createJsonLd<T extends Record<string, unknown>>(data: T): {
  type: string;
  id: string;
  dangerouslySetInnerHTML: { __html: string };
} {
  return {
    type: 'application/ld+json',
    id: `json-ld-${JSON.stringify(data).slice(0, 10).replace(/[^a-zA-Z0-9]/g, '')}`,
    dangerouslySetInnerHTML: {
      __html: JSON.stringify(data, null, 0), // Minified
    },
  };
}
