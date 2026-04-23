import { BLOG_CATEGORIES, calculateSEOScore } from "@/lib/blog";
import { extractBlogPlainText } from "@/lib/blog-rich-text";
import type { BlogPost as BlogRow } from "@/lib/supabase";
import type { BlogCategory, BlogPost } from "@/types/blog";

const DEFAULT_CATEGORY: BlogCategory = "updates";
const STOPWORDS = new Set([
  "ve",
  "ile",
  "icin",
  "için",
  "bir",
  "bu",
  "da",
  "de",
  "mi",
  "mu",
  "mu?",
  "mı",
  "mü",
  "nasil",
  "nasıl",
  "rehber",
]);

function normalizeText(value: string | null | undefined): string {
  return (value || "")
    .toLocaleLowerCase("tr-TR")
    .replace(/ç/g, "c")
    .replace(/ğ/g, "g")
    .replace(/ı/g, "i")
    .replace(/ö/g, "o")
    .replace(/ş/g, "s")
    .replace(/ü/g, "u")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function tokenize(value: string | null | undefined): string[] {
  return normalizeText(value)
    .split(" ")
    .filter((token) => token.length > 2 && !STOPWORDS.has(token));
}

function deriveWordCount(content: string): number {
  return extractBlogPlainText(content).trim().split(/\s+/).filter(Boolean).length;
}

function deriveCategory(row: BlogRow): BlogCategory {
  const corpus = normalizeText([row.title, row.slug, row.excerpt, row.content].join(" "));

  for (const category of BLOG_CATEGORIES) {
    const keywords = [category.slug, category.name, category.description]
      .map((value) => normalizeText(value))
      .filter(Boolean);

    if (keywords.some((keyword) => corpus.includes(keyword))) {
      return category.id;
    }
  }

  return DEFAULT_CATEGORY;
}

function deriveExcerpt(row: BlogRow, content: string): string {
  const excerpt = row.excerpt?.trim();
  if (excerpt) return excerpt;

  const normalizedContent = extractBlogPlainText(content).replace(/\s+/g, " ").trim();
  if (normalizedContent.length <= 180) return normalizedContent;

  return `${normalizedContent.slice(0, 177).trimEnd()}...`;
}

function deriveTags(row: BlogRow): string[] {
  return uniqueStrings([...tokenize(row.title), ...tokenize(row.excerpt)]).slice(0, 4);
}

function normalizeStatus(status: string | null | undefined): BlogPost["status"] {
  if (status === "published" || status === "archived" || status === "draft") {
    return status;
  }

  return "draft";
}

export function mapBlogRow(row: BlogRow): BlogPost {
  const content = row.content || "";
  const excerpt = deriveExcerpt(row, content);
  const wordCount = deriveWordCount(content);
  const readTime = Math.max(1, Math.ceil(wordCount / 200));
  const category = deriveCategory(row);
  const tags = deriveTags(row);
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
    category,
    tags,
    publishedAt,
    updatedAt: publishedAt,
    readTime,
    featured: false,
    views: 0,
    status: normalizeStatus(row.status),
    topicType: "standalone",
    pillarId: null,
    targetKeywords: tags,
    primaryKeyword:
      tags[0] || BLOG_CATEGORIES.find((item) => item.id === category)?.name || "blog",
    wordCount,
    seoScore: calculateSEOScore({
      title: row.title,
      excerpt,
      content,
      coverImage: row.featured_image || "",
      tags,
      topicType: "standalone",
      primaryKeyword: tags[0] || "",
      targetKeywords: tags,
      internalLinks: [],
      relatedProducts: [],
    }),
    internalLinks: [],
    relatedProducts: [],
  };
}

export function mapBlogRows(rows: BlogRow[] | null | undefined): BlogPost[] {
  return (rows || [])
    .map(mapBlogRow)
    .sort((left, right) => right.publishedAt.getTime() - left.publishedAt.getTime());
}

export function getRelatedPosts(posts: BlogPost[], currentPost: BlogPost, limit = 3): BlogPost[] {
  return posts
    .filter((post) => post.id !== currentPost.id && post.category === currentPost.category)
    .slice(0, limit);
}
