import { calculateSEOScore } from "@/lib/blog";
import { slugify } from "@/lib/utils";
import type { BlogPost, ContentStatus } from "@/types/blog";

export interface BlogEditorRow {
  id: string;
  title: string;
  slug: string;
  content: string | null;
  excerpt: string | null;
  featured_image: string | null;
  author: string | null;
  status: string | null;
  published_at: string | null;
  created_at: string;
}

function normalizeStatus(status: string | null | undefined): ContentStatus {
  if (status === "published" || status === "archived" || status === "draft") {
    return status;
  }

  return "draft";
}

function deriveWordCount(content: string): number {
  return content
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function deriveReadTime(wordCount: number): number {
  return Math.max(1, Math.ceil(wordCount / 200));
}

function deriveTargetKeywords(title: string, excerpt: string): string[] {
  const corpus = `${title} ${excerpt}`
    .toLocaleLowerCase("tr-TR")
    .replace(/[^a-z0-9\s\u00c0-\u017f]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 3);

  return [...new Set(corpus)].slice(0, 5);
}

function deriveExcerpt(content: string): string {
  const firstParagraph = content
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .find(Boolean);

  if (!firstParagraph) {
    return "";
  }

  return firstParagraph.length > 180
    ? `${firstParagraph.slice(0, 177).trimEnd()}...`
    : firstParagraph;
}

export function mapBlogRowToEditorPost(row: BlogEditorRow): BlogPost {
  const content = row.content || "";
  const excerpt = row.excerpt || deriveExcerpt(content);
  const wordCount = deriveWordCount(content);
  const targetKeywords = deriveTargetKeywords(row.title, excerpt);
  const status = normalizeStatus(row.status);
  const publishedAt = new Date(row.published_at || row.created_at);

  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    excerpt,
    content,
    coverImage: row.featured_image || "",
    author: {
      name: row.author || "Admin",
      avatar: "",
      role: "Editor",
    },
    category: "haberler",
    tags: targetKeywords.slice(0, 4),
    publishedAt,
    updatedAt: publishedAt,
    readTime: deriveReadTime(wordCount),
    featured: false,
    views: 0,
    status,
    topicType: "standalone",
    pillarId: null,
    targetKeywords,
    primaryKeyword: targetKeywords[0] || "",
    wordCount,
    seoScore: calculateSEOScore({
      title: row.title,
      excerpt,
      content,
      primaryKeyword: targetKeywords[0] || "",
      targetKeywords,
      coverImage: row.featured_image || "",
      tags: targetKeywords.slice(0, 4),
      topicType: "standalone",
      internalLinks: [],
      relatedProducts: [],
      wordCount,
    }),
    internalLinks: [],
    relatedProducts: [],
  };
}

export function validateBlogEditorInput(input: Partial<BlogPost>): string | null {
  const title = input.title?.trim();
  const slug = (input.slug?.trim() || slugify(input.title || "")).trim();
  const status = normalizeStatus(input.status);

  if (!title) {
    return "Yazi basligi zorunludur.";
  }

  if (!slug) {
    return "Slug zorunludur.";
  }

  if (status === "published" && !input.content?.trim()) {
    return "Yayina almak icin icerik gereklidir.";
  }

  return null;
}

export function buildBlogRowInput(input: Partial<BlogPost>) {
  const title = input.title?.trim() || "";
  const slug = (input.slug?.trim() || slugify(title)).trim();
  const content = input.content?.trim() || "";
  const excerpt = input.excerpt?.trim() || deriveExcerpt(content);
  const status = normalizeStatus(input.status);

  return {
    title,
    slug,
    content: content || null,
    excerpt: excerpt || null,
    featured_image: input.coverImage?.trim() || null,
    author: input.author?.name?.trim() || "Admin",
    status,
    published_at:
      status === "published"
        ? (input.publishedAt instanceof Date ? input.publishedAt : new Date()).toISOString()
        : null,
  };
}
