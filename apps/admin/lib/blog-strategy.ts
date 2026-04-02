import "server-only";

import { CONTENT_GUIDELINES, calculateSEOScore } from "@/lib/blog";
import { createServerClient } from "@/lib/supabase";
import { getStoreRuntime } from "@/lib/store-runtime";
import type { BlogPost, TopicType } from "@/types/blog";
import type {
  BlogStrategyCategory,
  BlogStrategyPillar,
  BlogStrategySnapshot,
} from "@/types/blog-strategy";

type BlogRow = {
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
};

type CategoryRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  parent_id: string | null;
  sort_order: number | null;
};

type ProductRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  short_description: string | null;
  category: string | null;
  subcategory: string | null;
  tags: string[] | null;
  status: string | null;
};

type PostMatch = {
  post: BlogPost;
  pillarId: string | null;
};

const MAX_PILLARS = 6;
const MAX_PRODUCTS_PER_CATEGORY = 6;
const MAX_KEYWORDS_PER_PILLAR = 6;
const GENERIC_CATEGORY_ID = "genel";
const GUIDE_TERMS = [
  "rehber",
  "nasil",
  "nasıl",
  "secim",
  "seçim",
  "modeller",
  "bakim",
  "bakım",
  "kombin",
  "oner",
  "öner",
  "karsilastirma",
  "karşılaştırma",
];
const STOPWORDS = new Set([
  "ve",
  "ile",
  "icin",
  "için",
  "gibi",
  "olan",
  "olanlar",
  "neden",
  "hangi",
  "daha",
  "gore",
  "göre",
  "bir",
  "iki",
  "uc",
  "üç",
  "deri",
  "kordon",
  "craft",
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

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map((value) => (value || "").trim()).filter(Boolean))];
}

function tokenize(value: string | null | undefined): string[] {
  return normalizeText(value)
    .split(" ")
    .filter((token) => token.length > 2 && !STOPWORDS.has(token));
}

function scoreKeywordMatch(corpus: string, keywords: string[]): number {
  return keywords.reduce((score, keyword) => {
    const normalizedKeyword = normalizeText(keyword);
    if (!normalizedKeyword) return score;
    return corpus.includes(normalizedKeyword) ? score + 1 : score;
  }, 0);
}

function hasGuideIntent(title: string, wordCount: number): boolean {
  const normalizedTitle = normalizeText(title);
  return GUIDE_TERMS.some((term) => normalizedTitle.includes(term)) || wordCount >= CONTENT_GUIDELINES.pillar.minWords;
}

function buildClusterTitles(categoryName: string, categorySlug: string): string[] {
  const normalizedSlug = normalizeText(categorySlug);

  if (normalizedSlug.includes("apple watch")) {
    return [
      "Apple Watch kayis olcu rehberi",
      "Apple Watch kayis deri bakimi",
      "Apple Watch kayis renk kombinleri",
      "Apple Watch kayis hediye onerileri",
    ];
  }

  if (normalizedSlug.includes("saat kayis")) {
    return [
      `${categoryName} nasil secilir`,
      `${categoryName} olcu rehberi`,
      `${categoryName} deri bakimi`,
      `${categoryName} stil onerileri`,
    ];
  }

  if (normalizedSlug.includes("cuzdan") || normalizedSlug.includes("kartlik")) {
    return [
      `${categoryName} modelleri`,
      `${categoryName} hediye rehberi`,
      `${categoryName} deri bakimi`,
      `${categoryName} gunluk kullanim onerileri`,
    ];
  }

  if (normalizedSlug.includes("canta") || normalizedSlug.includes("organizer")) {
    return [
      `${categoryName} kullanim rehberi`,
      `${categoryName} kombin onerileri`,
      `${categoryName} deri bakimi`,
      `${categoryName} hediye secenekleri`,
    ];
  }

  if (normalizedSlug.includes("aksesuar")) {
    return [
      `${categoryName} secim rehberi`,
      `${categoryName} bakim onerileri`,
      `${categoryName} hediye fikirleri`,
      `${categoryName} kombin onerileri`,
    ];
  }

  return [
    `${categoryName} rehberi`,
    `${categoryName} nasil secilir`,
    `${categoryName} bakim onerileri`,
    `${categoryName} hediye fikirleri`,
  ];
}

function buildCategoryCandidates(categories: CategoryRow[]): CategoryRow[] {
  const sorted = [...categories].sort((a, b) => {
    const orderDiff = (a.sort_order || 0) - (b.sort_order || 0);
    if (orderDiff !== 0) return orderDiff;
    return a.name.localeCompare(b.name, "tr");
  });

  const topLevel = sorted.filter((category) => !category.parent_id);
  return (topLevel.length > 0 ? topLevel : sorted).slice(0, MAX_PILLARS);
}

function getDescendantCategoryIds(
  category: CategoryRow,
  categories: CategoryRow[],
): Set<string> {
  const descendants = new Set<string>([category.id]);
  const queue = [category.id];

  while (queue.length > 0) {
    const currentId = queue.shift();
    if (!currentId) continue;

    for (const child of categories) {
      if (child.parent_id === currentId && !descendants.has(child.id)) {
        descendants.add(child.id);
        queue.push(child.id);
      }
    }
  }

  return descendants;
}

function getProductsForCategory(
  category: CategoryRow,
  categories: CategoryRow[],
  products: ProductRow[],
): ProductRow[] {
  const descendantIds = getDescendantCategoryIds(category, categories);
  const relatedCategories = categories.filter((candidate) => descendantIds.has(candidate.id));
  const categoryTerms = new Set<string>();

  for (const relatedCategory of relatedCategories) {
    categoryTerms.add(normalizeText(relatedCategory.slug));
    categoryTerms.add(normalizeText(relatedCategory.name));
  }

  return products.filter((product) => {
    const categoryValue = normalizeText(product.category);
    const subcategoryValue = normalizeText(product.subcategory);

    if (categoryTerms.has(categoryValue) || categoryTerms.has(subcategoryValue)) {
      return true;
    }

    const productCorpus = normalizeText(
      [product.name, product.description, product.short_description, ...(product.tags || [])].join(" "),
    );

    return [...categoryTerms].some((term) => term.length > 0 && productCorpus.includes(term));
  });
}

function buildStrategyCategories(
  categories: CategoryRow[],
  products: ProductRow[],
): BlogStrategyCategory[] {
  const categoryCandidates = buildCategoryCandidates(categories);

  const strategyCategories = categoryCandidates.map((category) => {
    const categoryProducts = getProductsForCategory(category, categories, products);

    return {
      id: category.slug || category.id,
      name: category.name,
      slug: category.slug,
      description:
        category.description ||
        `${category.name} odakli blog icerikleri ve satin alma rehberleri`,
      productCount: categoryProducts.length,
    };
  });

  if (strategyCategories.length === 0) {
    strategyCategories.push({
      id: GENERIC_CATEGORY_ID,
      name: "Genel",
      slug: GENERIC_CATEGORY_ID,
      description: "Magaza geneli icerik stratejisi",
      productCount: products.length,
    });
  }

  return strategyCategories;
}

function buildStrategyPillars(
  strategyCategories: BlogStrategyCategory[],
  categories: CategoryRow[],
  products: ProductRow[],
): BlogStrategyPillar[] {
  return strategyCategories.map((category) => {
    const sourceCategory = categories.find((candidate) => candidate.slug === category.slug);
    const categoryProducts = sourceCategory
      ? getProductsForCategory(sourceCategory, categories, products).slice(0, MAX_PRODUCTS_PER_CATEGORY)
      : products.slice(0, MAX_PRODUCTS_PER_CATEGORY);
    const productNameKeywords = categoryProducts.flatMap((product) => tokenize(product.name).slice(0, 2));
    const targetKeywords = uniqueStrings([
      category.name,
      `${category.name} rehberi`,
      `${category.name} modelleri`,
      ...productNameKeywords,
    ]).slice(0, MAX_KEYWORDS_PER_PILLAR);

    return {
      id: category.slug || category.id,
      title: `${category.name} Rehberi`,
      description: `${category.name} kategorisi icin satin alma, kullanim ve bakim odakli icerik planlari.`,
      targetKeywords,
      suggestedClusters: buildClusterTitles(category.name, category.slug),
      categoryId: category.id,
      productCount: categoryProducts.length,
      existingPillarPostId: null,
      existingClusterCount: 0,
    };
  });
}

function deriveCategoryForPost(
  corpus: string,
  categories: BlogStrategyCategory[],
): BlogStrategyCategory | null {
  let bestMatch: BlogStrategyCategory | null = null;
  let bestScore = 0;

  for (const category of categories) {
    const score = scoreKeywordMatch(corpus, [category.name, category.slug]);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = category;
    }
  }

  return bestMatch;
}

function mapPosts(
  rows: BlogRow[],
  strategyCategories: BlogStrategyCategory[],
  strategyPillars: BlogStrategyPillar[],
): PostMatch[] {
  const pillarById = new Map(strategyPillars.map((pillar) => [pillar.id, pillar]));

  return rows.map((row) => {
    const corpus = normalizeText([row.title, row.slug, row.excerpt, row.content].join(" "));
    const category = deriveCategoryForPost(corpus, strategyCategories);
    const wordCount = (row.content || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean).length;

    let matchedPillarId: string | null = category?.id || null;
    let topicType: TopicType = "standalone";

    if (matchedPillarId) {
      const pillar = pillarById.get(matchedPillarId);
      const clusterMatch = pillar?.suggestedClusters.some((clusterTitle) =>
        corpus.includes(normalizeText(clusterTitle)),
      );

      if (clusterMatch) {
        topicType = "cluster";
      } else if (hasGuideIntent(row.title, wordCount)) {
        topicType = "pillar";
      }
    }

    const targetKeywords = uniqueStrings([
      category?.name,
      ...tokenize(row.title).slice(0, 4),
      ...tokenize(row.excerpt).slice(0, 2),
    ]);

    const post: BlogPost = {
      id: row.id,
      title: row.title,
      slug: row.slug,
      excerpt: row.excerpt || "",
      content: row.content || "",
      coverImage: row.featured_image || "",
      author: {
        name: row.author || "Admin",
        avatar: "",
        role: "Editor",
      },
      category: category?.id || GENERIC_CATEGORY_ID,
      tags: targetKeywords.slice(0, 4),
      publishedAt: new Date(row.published_at || row.created_at),
      updatedAt: new Date(row.published_at || row.created_at),
      readTime: Math.max(1, Math.ceil(wordCount / 200)),
      featured: false,
      views: 0,
      status:
        row.status === "published" || row.status === "archived" || row.status === "draft"
          ? row.status
          : "draft",
      topicType,
      pillarId: topicType === "cluster" ? matchedPillarId : null,
      targetKeywords,
      primaryKeyword: targetKeywords[0] || category?.name || "icerik stratejisi",
      wordCount,
      seoScore: calculateSEOScore({
        title: row.title,
        excerpt: row.excerpt || "",
        content: row.content || "",
        primaryKeyword: targetKeywords[0] || "",
        targetKeywords,
        coverImage: row.featured_image || "",
        tags: targetKeywords.slice(0, 4),
        topicType,
        internalLinks: [],
        relatedProducts: [],
      }),
      internalLinks: [],
      relatedProducts: [],
    };

    return {
      post,
      pillarId: matchedPillarId,
    };
  });
}

function attachExistingProgress(
  pillars: BlogStrategyPillar[],
  mappedPosts: PostMatch[],
): BlogStrategyPillar[] {
  return pillars.map((pillar) => {
    const pillarPosts = mappedPosts.filter(
      (entry) => entry.pillarId === pillar.id && entry.post.topicType === "pillar",
    );
    const clusterPosts = mappedPosts.filter(
      (entry) => entry.pillarId === pillar.id && entry.post.topicType === "cluster",
    );

    return {
      ...pillar,
      existingPillarPostId: pillarPosts[0]?.post.id || null,
      existingClusterCount: clusterPosts.length,
    };
  });
}

function buildFocusTerms(
  strategyCategories: BlogStrategyCategory[],
  products: ProductRow[],
  storeName: string,
): string[] {
  return uniqueStrings([
    ...strategyCategories.map((category) => category.name),
    ...products.slice(0, 6).map((product) => product.name),
    storeName,
  ]).slice(0, 10);
}

export async function getBlogStrategySnapshot(): Promise<BlogStrategySnapshot> {
  const supabase = createServerClient();
  const storeRuntime = getStoreRuntime();

  const [{ data: blogRows, error: blogError }, { data: categoryRows, error: categoryError }, { data: productRows, error: productError }] =
    await Promise.all([
      supabase
        .from("blog_posts")
        .select("id, title, slug, content, excerpt, featured_image, author, status, published_at, created_at")
        .order("created_at", { ascending: false }),
      supabase
        .from("categories")
        .select("id, name, slug, description, parent_id, sort_order")
        .order("sort_order", { ascending: true }),
      supabase
        .from("products")
        .select("id, name, slug, description, short_description, category, subcategory, tags, status")
        .order("created_at", { ascending: false }),
    ]);

  if (blogError) {
    throw blogError;
  }

  if (categoryError) {
    throw categoryError;
  }

  if (productError) {
    throw productError;
  }

  const categories = (categoryRows || []) as CategoryRow[];
  const products = ((productRows || []) as ProductRow[]).filter(
    (product) => !product.status || product.status === "published",
  );
  const strategyCategories = buildStrategyCategories(categories, products);
  const basePillars = buildStrategyPillars(strategyCategories, categories, products);
  const mappedPosts = mapPosts((blogRows || []) as BlogRow[], strategyCategories, basePillars);
  const posts = mappedPosts.map((entry) => entry.post);
  const suggestedPillars = attachExistingProgress(basePillars, mappedPosts);

  return {
    posts,
    categories: strategyCategories,
    suggestedPillars,
    progress: {
      pillar: {
        total: posts.filter((post) => post.topicType === "pillar").length,
        target: suggestedPillars.length,
      },
      cluster: {
        total: posts.filter((post) => post.topicType === "cluster").length,
        target: suggestedPillars.reduce((sum, pillar) => sum + pillar.suggestedClusters.length, 0),
      },
      standalone: {
        total: posts.filter((post) => post.topicType === "standalone").length,
      },
    },
    contentGuidelines: CONTENT_GUIDELINES,
    storeContext: {
      name: storeRuntime.name,
      slug: storeRuntime.slug,
      totalProducts: products.length,
      totalCategories: strategyCategories.length,
      totalPosts: posts.length,
      focusTerms: buildFocusTerms(strategyCategories, products, storeRuntime.name),
    },
  };
}
