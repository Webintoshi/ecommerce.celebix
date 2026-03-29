// SEO Hub - Topical Authority Type Definitions

export interface Pillar {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  icon: string | null;
  sort_order: number;
  is_active: boolean;
  meta_title: string | null;
  meta_desc: string | null;
  created_at: string;
  updated_at: string;

  // Relations
  clusters?: Cluster[];
}

export interface Cluster {
  id: string;
  pillar_id: string;
  slug: string;
  title: string;
  description: string | null;
  mdx_file: string;
  word_count: number | null;
  reading_time: number | null; // dakika
  primary_keyword: string | null;
  secondary_keywords: string[] | null;
  search_intent: 'informational' | 'navigational' | 'commercial' | 'transactional' | null;
  status: 'draft' | 'published' | 'archived';
  published_at: string | null;
  meta_title: string | null;
  meta_desc: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;

  // Relations
  pillar?: Pillar;
}

export interface ContentLink {
  id: string;
  from_type: 'pillar' | 'cluster';
  from_id: string;
  to_type: 'pillar' | 'cluster';
  to_id: string;
  anchor_text: string;
  link_type: 'contextual' | 'related' | 'hub-spoke';
  created_at: string;
}

// MDX Frontmatter Types
export interface MDXFrontmatter {
  title: string;
  description: string;
  primaryKeyword: string;
  secondaryKeywords?: string[];
  searchIntent?: 'informational' | 'navigational' | 'commercial' | 'transactional';
  publishedAt: string;
  updatedAt?: string;
  readingTime?: number;
  wordCount?: number;
  pillarTitle?: string;
  relatedClusters?: string[];
  faq?: Array<{ question: string; answer: string }>;
}

export interface MDXContent {
  frontmatter: MDXFrontmatter;
  content: string;
  headings: Array<{
    id: string;
    text: string;
    level: number;
  }>;
}

// Breadcrumb Types
export interface BreadcrumbItem {
  label: string;
  href: string;
}

// Schema.org Types
export interface SchemaArticle {
  '@context': string;
  '@type': 'TechArticle' | 'Article';
  headline: string;
  description: string;
  datePublished: string;
  dateModified: string;
  author: {
    '@type': 'Person';
    name: string;
    url?: string;
  };
  publisher: {
    '@type': 'Organization';
    name: string;
    logo?: {
      '@type': 'ImageObject';
      url: string;
    };
  };
  mainEntityOfPage: {
    '@type': 'WebPage';
    '@id': string;
  };
  about?: {
    '@type': 'Thing';
    name: string;
  };
  keywords: string;
  wordCount?: number;
  timeRequired?: string;
}

export interface SchemaBreadcrumb {
  '@context': string;
  '@type': 'BreadcrumbList';
  itemListElement: Array<{
    '@type': 'ListItem';
    position: number;
    name: string;
    item: string;
  }>;
}

export interface SchemaFAQ {
  '@context': string;
  '@type': 'FAQPage';
  mainEntity: Array<{
    '@type': 'Question';
    name: string;
    acceptedAnswer: {
      '@type': 'Answer';
      text: string;
    };
  }>;
}

// SEO Hub Page Data Types
export interface HubPageData {
  pillars: Pillar[];
  totalClusters: number;
}

export interface PillarPageData {
  pillar: Pillar;
  clusters: Cluster[];
  relatedPillars?: Pillar[];
}

export interface ClusterPageData {
  cluster: Cluster;
  pillar: Pillar;
  relatedClusters?: Cluster[];
  frontmatter: MDXFrontmatter;
  content: string;
  headings: Array<{
    id: string;
    text: string;
    level: number;
  }>;
}
