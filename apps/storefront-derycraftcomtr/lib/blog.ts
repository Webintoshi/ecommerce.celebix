import { STOREFRONT_RUNTIME } from "@/lib/storefront-runtime";
import type { BlogCategoryInfo, BlogPost } from "@/types/blog";

export const BLOG_CATEGORIES: BlogCategoryInfo[] = [
  {
    id: "design",
    name: "Design Notes",
    slug: "tasarim-notlari",
    description: "Product design, material language and selection criteria.",
    icon: "◇",
  },
  {
    id: "workshop",
    name: "Workshop",
    slug: "atolye",
    description: "Production quality, craftsmanship and detail-focused content.",
    icon: "▣",
  },
  {
    id: "guides",
    name: "Guides",
    slug: "rehberler",
    description: "Editorial guides that make purchase decisions easier.",
    icon: "→",
  },
  {
    id: "stories",
    name: "Stories",
    slug: "hikayeler",
    description: "Brand stories, collection launches and editorial notes.",
    icon: "∞",
  },
  {
    id: "updates",
    name: "Updates",
    slug: "guncellemeler",
    description: `New updates from ${STOREFRONT_RUNTIME.name}.`,
    icon: "•",
  },
];

export const SUGGESTED_PILLARS = [
  {
    id: "urun-secim-rehberi",
    title: "Product Selection Guide",
    description: "A core editorial framework that gives customers confidence at decision time.",
    targetKeywords: ["product selection guide", "buying guide", "collection guide"],
    suggestedClusters: [
      "5 critical tips for choosing the right product",
      "How to explain material and craftsmanship differences",
      "How to make gift-focused product selection easier",
      "How to present collection structure on the storefront",
      "How to build premium PDP copy",
    ],
  },
  {
    id: "marka-ve-deneyim",
    title: "Brand and Experience Guide",
    description: "A content framework that supports storefront trust and editorial tone.",
    targetKeywords: ["brand story", "shopping experience", "customer trust"],
    suggestedClusters: [
      "Explaining store policies with trust-building language",
      "Why shipping and return copy affects conversion",
      "How blog content supports collection stories",
      "How reviews and social proof get stronger",
      "Landing logic that warms new visitors to the brand",
    ],
  },
];

export const CONTENT_GUIDELINES = {
  pillar: {
    minWords: 1600,
    idealWords: 2200,
    description: "Reference content that strongly owns the main topic.",
  },
  cluster: {
    minWords: 900,
    idealWords: 1300,
    description: "Supporting content that answers a specific need.",
  },
  standalone: {
    minWords: 600,
    idealWords: 900,
    description: "A standalone editorial blog post that creates value on its own.",
  },
};

export const SEO_CHECKLIST = [
  { id: "title", label: "SEO Title", weight: 15 },
  { id: "meta", label: "Meta Description", weight: 10 },
  { id: "heading", label: "H1 Heading", weight: 10 },
  { id: "subheadings", label: "H2/H3 Subheadings", weight: 10 },
  { id: "keyword", label: "Keyword Usage", weight: 15 },
  { id: "internal", label: "Internal Link", weight: 10 },
  { id: "product", label: "Product Link", weight: 10 },
  { id: "image", label: "Image and Alt Text", weight: 10 },
  { id: "wordcount", label: "Word Count", weight: 10 },
];

export const BLOG_POSTS: BlogPost[] = [];

export function getBlogPosts(): BlogPost[] {
  return BLOG_POSTS.sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
}

export function getFeaturedPosts(limit = 3): BlogPost[] {
  return BLOG_POSTS.filter((post) => post.featured)
    .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
    .slice(0, limit);
}

export function getPostBySlug(slug: string): BlogPost | undefined {
  return BLOG_POSTS.find((post) => post.slug === slug);
}

export function getPostsByCategory(category: string): BlogPost[] {
  return BLOG_POSTS.filter((post) => post.category === category).sort(
    (a, b) => b.publishedAt.getTime() - a.publishedAt.getTime(),
  );
}

export function getRelatedPosts(post: BlogPost, limit = 3): BlogPost[] {
  return BLOG_POSTS.filter((candidate) => candidate.category === post.category && candidate.id !== post.id)
    .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
    .slice(0, limit);
}

export function searchPosts(query: string): BlogPost[] {
  const needle = query.toLowerCase();
  return BLOG_POSTS.filter(
    (post) =>
      post.title.toLowerCase().includes(needle) ||
      post.excerpt.toLowerCase().includes(needle) ||
      post.tags.some((tag) => tag.toLowerCase().includes(needle)),
  );
}

export function getPillars(): BlogPost[] {
  return BLOG_POSTS.filter((post) => post.topicType === "pillar");
}

export function getClustersByPillar(pillarId: string): BlogPost[] {
  return BLOG_POSTS.filter((post) => post.topicType === "cluster" && post.pillarId === pillarId);
}

export function calculateSEOScore(post: Partial<BlogPost>): number {
  let score = 0;
  const guidelines = CONTENT_GUIDELINES[post.topicType || "standalone"];

  if (post.wordCount && post.wordCount >= guidelines.minWords) {
    score += 10;
    if (post.wordCount >= guidelines.idealWords) score += 5;
  }

  if (post.primaryKeyword?.length) score += 15;
  if (post.targetKeywords && post.targetKeywords.length >= 3) score += 10;
  if (post.internalLinks && post.internalLinks.length > 0) score += 10;
  if (post.relatedProducts && post.relatedProducts.length > 0) score += 10;
  if (post.title && post.title.length >= 30) score += 15;
  if (post.excerpt && post.excerpt.length >= 100) score += 10;
  if (post.coverImage) score += 10;
  if (post.tags && post.tags.length >= 3) score += 5;

  return Math.min(score, 100);
}

export function getContentProgress(): {
  pillar: { total: number; target: number };
  cluster: { total: number; target: number };
  standalone: { total: number };
} {
  const pillars = getPillars();
  const clusters = BLOG_POSTS.filter((post) => post.topicType === "cluster");
  const standalone = BLOG_POSTS.filter((post) => post.topicType === "standalone");

  return {
    pillar: { total: pillars.length, target: SUGGESTED_PILLARS.length },
    cluster: { total: clusters.length, target: pillars.length * 5 },
    standalone: { total: standalone.length },
  };
}
