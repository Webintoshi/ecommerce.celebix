"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BarChart3,
  Eye,
  Image as ImageIcon,
  Loader2,
  Save,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  BLOG_CATEGORIES,
  CONTENT_GUIDELINES,
  SUGGESTED_PILLARS,
  calculateSEOScore,
} from "@/lib/blog";
import {
  countBlogImages,
  countBlogLinks,
  extractBlogOutline,
  extractBlogPlainText,
  prepareBlogEditorContent,
  renderBlogContentToHtml,
} from "@/lib/blog-rich-text";
import { fetchBlogStrategySnapshot } from "@/lib/blog-strategy-client";
import { slugify } from "@/lib/utils";
import { RichTextEditor } from "@/components/admin/RichTextEditor";
import type { BlogPost, BlogCategory } from "@/types/blog";
import type { BlogStrategyCategory, BlogStrategyPillar } from "@/types/blog-strategy";

interface BlogFormProps {
  initialData?: BlogPost;
}

type EditorMode = "write" | "split" | "preview";

const DEFAULT_FORM_DATA: BlogPost = {
  id: "",
  title: "",
  slug: "",
  excerpt: "",
  content: "",
  coverImage: "",
  author: { name: "Admin", avatar: "", role: "Editor" },
  category: "haberler",
  tags: [],
  publishedAt: new Date(),
  updatedAt: new Date(),
  readTime: 1,
  featured: false,
  views: 0,
  status: "draft",
  topicType: "standalone",
  pillarId: null,
  targetKeywords: [],
  primaryKeyword: "",
  wordCount: 0,
  seoScore: 0,
  internalLinks: [],
  relatedProducts: [],
};

const QUICK_SNIPPETS = [
  {
    label: "Giriş bölümü",
    value:
      "<h2>Giriş</h2><p>Bu bölümde konuyu kısa bir girişle açıklayın ve okuyucunun neden devam etmesi gerektiğini netleştirin.</p>",
  },
  {
    label: "Madde listesi",
    value:
      "<h2>One cikan maddeler</h2><ul><li>Madde 1</li><li>Madde 2</li><li>Madde 3</li></ul>",
  },
  {
    label: "SSS blogu",
    value:
      "<h2>Sik sorulan sorular</h2><h3>Soru 1</h3><p>Cevap...</p><h3>Soru 2</h3><p>Cevap...</p>",
  },
  {
    label: "Karsilastirma",
    value:
      "<h2>Karsilastirma</h2><h3>Avantajlar</h3><ul><li>Avantaj 1</li><li>Avantaj 2</li></ul><h3>Dikkat edilmesi gerekenler</h3><ul><li>Not 1</li><li>Not 2</li></ul>",
  },
  {
    label: "CTA bolumu",
    value:
      "<hr /><h2>Sonuc</h2><p>Yaziyi kisa bir sonuc ile kapatin ve gerekiyorsa okuyucuyu ilgili kategoriye ya da urune yonlendirin.</p>",
  },
];

function createAltFromFileName(fileName: string) {
  const cleaned = fileName
    .replace(/\.[^/.]+$/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned || "blog gorseli";
}

function normalizeInitialData(initialData?: BlogPost): BlogPost {
  if (!initialData) {
    return DEFAULT_FORM_DATA;
  }

  return {
    ...initialData,
    content: prepareBlogEditorContent(initialData.content),
  };
}

export function BlogForm({ initialData }: BlogFormProps) {
  const router = useRouter();
  const coverInputRef = useRef<HTMLInputElement | null>(null);
  const inlineImageInputRef = useRef<HTMLInputElement | null>(null);
  const [loading, setLoading] = useState(false);
  const [coverUploading, setCoverUploading] = useState(false);
  const [inlineUploading, setInlineUploading] = useState(false);
  const [editorMode, setEditorMode] = useState<EditorMode>("split");
  const [categories, setCategories] = useState<BlogStrategyCategory[]>(
    BLOG_CATEGORIES.map((item) => ({
      id: item.id,
      name: item.name,
      slug: item.slug,
      description: item.description,
      productCount: 0,
    })),
  );
  const [pillars, setPillars] = useState<BlogStrategyPillar[]>(
    SUGGESTED_PILLARS.map((item) => ({
      ...item,
      categoryId: null,
      productCount: 0,
      existingPillarPostId: null,
      existingClusterCount: 0,
    })),
  );
  const [formData, setFormData] = useState<BlogPost>(() => normalizeInitialData(initialData));

  useEffect(() => {
    if (initialData) {
      setFormData(normalizeInitialData(initialData));
    }
  }, [initialData]);

  useEffect(() => {
    let active = true;

    async function loadStrategy() {
      try {
        const snapshot = await fetchBlogStrategySnapshot();

        if (!active) {
          return;
        }

        if (snapshot.categories.length > 0) {
          setCategories(snapshot.categories);
        }

        if (snapshot.suggestedPillars.length > 0) {
          setPillars(snapshot.suggestedPillars);
        }
      } catch (error) {
        console.error("Blog strategy load error:", error);
      }
    }

    void loadStrategy();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const plainText = extractBlogPlainText(formData.content);
    const wordCount = plainText.trim().split(/\s+/).filter(Boolean).length;
    const readTime = Math.max(1, Math.ceil(wordCount / 200));

    setFormData((prev) =>
      prev.wordCount === wordCount && prev.readTime === readTime
        ? prev
        : { ...prev, wordCount, readTime },
    );
  }, [formData.content]);

  useEffect(() => {
    const seoScore = calculateSEOScore(formData);
    setFormData((prev) => (prev.seoScore === seoScore ? prev : { ...prev, seoScore }));
  }, [
    formData.title,
    formData.excerpt,
    formData.content,
    formData.primaryKeyword,
    formData.targetKeywords,
    formData.coverImage,
    formData.tags,
    formData.wordCount,
  ]);

  const guide = CONTENT_GUIDELINES[formData.topicType || "standalone"];
  const previewHtml = useMemo(() => renderBlogContentToHtml(formData.content), [formData.content]);
  const outline = useMemo(() => extractBlogOutline(formData.content), [formData.content]);
  const editorMetrics = useMemo(() => {
    const plainText = extractBlogPlainText(formData.content);

    return {
      charCount: plainText.length,
      headingCount: outline.length,
      imageCount: countBlogImages(formData.content),
      linkCount: countBlogLinks(formData.content),
    };
  }, [formData.content, outline.length]);

  function patch(next: Partial<BlogPost>) {
    setFormData((prev) => ({ ...prev, ...next }));
  }

  function appendEditorHtml(value: string) {
    patch({
      content: `${formData.content || ""}${formData.content ? "\n" : ""}${value}`.trim(),
    });
  }

  async function uploadAsset(file: File, folder = "blog") {
    const uploadForm = new FormData();
    uploadForm.append("file", file);
    uploadForm.append("folder", folder);
    uploadForm.append("thumbnail", "false");

    const response = await fetch("/api/upload", {
      method: "POST",
      body: uploadForm,
    });
    const payload = await response.json();

    if (!response.ok || !payload.success || !payload.url) {
      throw new Error(payload.error || "Görsel yüklenemedi.");
    }

    return String(payload.url);
  }

  async function handleCoverUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setCoverUploading(true);
    try {
      const url = await uploadAsset(file, "blog");
      patch({ coverImage: url });
      toast.success("Kapak gorseli yuklendi.");
    } catch (error) {
      console.error("Blog cover upload error:", error);
      toast.error(error instanceof Error ? error.message : "Kapak gorseli yuklenemedi.");
    } finally {
      setCoverUploading(false);
      event.target.value = "";
    }
  }

  async function handleInlineImageUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const files = event.target.files;
    if (!files?.length) return;

    setInlineUploading(true);
    try {
      const uploadedUrls = await Promise.all(
        Array.from(files).map(async (file) => ({
          alt: createAltFromFileName(file.name),
          url: await uploadAsset(file, "blog"),
        })),
      );

      const htmlBlock = uploadedUrls
        .map((item) => `<p><img src="${item.url}" alt="${item.alt}" /></p>`)
        .join("");

      appendEditorHtml(htmlBlock);
      toast.success(
        uploadedUrls.length === 1
          ? "İçerik görseli eklendi."
          : `${uploadedUrls.length} görsel içeriğe eklendi.`,
      );
    } catch (error) {
      console.error("Blog inline image upload error:", error);
      toast.error(error instanceof Error ? error.message : "İçerik görselleri yüklenemedi.");
    } finally {
      setInlineUploading(false);
      event.target.value = "";
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);

    try {
      const response = await fetch(
        initialData ? `/api/admin/blog-posts/${initialData.id}` : "/api/admin/blog-posts",
        {
          method: initialData ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...formData,
            slug: formData.slug.trim() || slugify(formData.title),
          }),
        },
      );
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || "Blog yazisi kaydedilemedi.");
      }

      toast.success(initialData ? "Yazi guncellendi." : "Yazi olusturuldu.");
      router.push("/admin/cms/blog");
      router.refresh();
    } catch (error) {
      console.error("Blog save error:", error);
      toast.error(error instanceof Error ? error.message : "Blog yazisi kaydedilemedi.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="space-y-6" onSubmit={submit}>
      <input
        ref={coverInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleCoverUpload}
      />
      <input
        ref={inlineImageInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleInlineImageUpload}
      />

      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">
              {initialData ? "Yaziyi Duzenle" : "Yeni Yazi Ekle"}
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              Kapak gorseli, rich text icerik ve canli onizleme ile blog yazilarini yonetin.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-lg border border-gray-200 bg-white p-1 shadow-sm">
            {[
              { id: "write", label: "Yaz" },
              { id: "split", label: "Bolunmus" },
              { id: "preview", label: "Onizleme" },
            ].map((mode) => (
              <button
                key={mode.id}
                type="button"
                onClick={() => setEditorMode(mode.id as EditorMode)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                  editorMode === mode.id
                    ? "bg-gray-900 text-white"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                }`}
              >
                {mode.label}
              </button>
            ))}
          </div>
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-5 py-2 text-sm font-medium text-white transition hover:bg-gray-800 disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {formData.status === "published" ? "Kaydet ve Yayinla" : "Kaydet"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,2fr)_340px]">
        <div className="space-y-6">
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <label className="text-sm font-medium text-gray-700">
                Baslik
                <input
                  type="text"
                  value={formData.title}
                  onChange={(event) =>
                    patch({
                      title: event.target.value,
                      slug: initialData ? formData.slug : slugify(event.target.value),
                    })
                  }
                  className="mt-2 w-full rounded-lg border border-gray-200 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              </label>
              <label className="text-sm font-medium text-gray-700">
                Slug
                <input
                  type="text"
                  value={formData.slug}
                  onChange={(event) => patch({ slug: slugify(event.target.value) })}
                  className="mt-2 w-full rounded-lg border border-gray-200 px-4 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              </label>
              <label className="text-sm font-medium text-gray-700">
                Kategori
                <select
                  value={formData.category}
                  onChange={(event) => patch({ category: event.target.value as BlogCategory })}
                  className="mt-2 w-full rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                >
                  {categories.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-medium text-gray-700">
                Durum
                <select
                  value={formData.status}
                  onChange={(event) => patch({ status: event.target.value as BlogPost["status"] })}
                  className="mt-2 w-full rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                >
                  <option value="draft">Taslak</option>
                  <option value="published">Yayinda</option>
                  <option value="archived">Arsiv</option>
                </select>
              </label>
            </div>

            <label className="mt-4 block text-sm font-medium text-gray-700">
              Kisa Ozet
              <textarea
                rows={3}
                value={formData.excerpt}
                onChange={(event) => patch({ excerpt: event.target.value })}
                className="mt-2 w-full rounded-lg border border-gray-200 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </label>
          </div>

          {!initialData && (
            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="mb-3 text-sm font-semibold text-gray-900">İçerik tipi</div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                {(["pillar", "cluster", "standalone"] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() =>
                      patch({
                        topicType: type,
                        pillarId: type === "cluster" ? formData.pillarId : null,
                      })
                    }
                    className={`rounded-xl border px-4 py-3 text-left text-sm ${
                      formData.topicType === type
                        ? "border-gray-900 bg-gray-50 text-gray-900"
                        : "border-gray-200 text-gray-600"
                    }`}
                  >
                    <div className="font-medium capitalize">{type}</div>
                    <div className="mt-1 text-xs text-gray-400">
                      {CONTENT_GUIDELINES[type].minWords}+ kelime
                    </div>
                  </button>
                ))}
              </div>
              {formData.topicType === "cluster" && (
                <label className="mt-4 block text-sm font-medium text-gray-700">
                  Bagli oldugu pillar
                  <select
                    value={formData.pillarId || ""}
                    onChange={(event) => patch({ pillarId: event.target.value || null })}
                    className="mt-2 w-full rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  >
                    <option value="">Pillar secin...</option>
                    {pillars.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.title}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          )}

          <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-100 px-6 py-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-gray-900">İçerik</div>
                  <div className="mt-1 text-xs text-gray-500">
                    {formData.wordCount} kelime, hedef {guide.minWords}+
                  </div>
                </div>
                <div className="w-28 rounded-full bg-gray-100 p-1">
                  <div
                    className={`h-2 rounded-full ${
                      formData.wordCount >= guide.minWords ? "bg-emerald-500" : "bg-amber-500"
                    }`}
                    style={{
                      width: `${Math.max(
                        Math.min((formData.wordCount / guide.minWords) * 100, 100),
                        8,
                      )}%`,
                    }}
                  />
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <MetricPill label="Karakter" value={String(editorMetrics.charCount)} />
                <MetricPill label="Baslik" value={String(editorMetrics.headingCount)} />
                <MetricPill label="Link" value={String(editorMetrics.linkCount)} />
                <MetricPill label="Görsel" value={String(editorMetrics.imageCount)} />
              </div>
            </div>

            {editorMode === "preview" ? (
              <div
                className="prose prose-gray max-w-none p-6"
                dangerouslySetInnerHTML={{ __html: previewHtml || "<p>Henuz icerik yok.</p>" }}
              />
            ) : (
              <div className="space-y-4 p-6">
                <div className="flex flex-wrap gap-2">
                  {QUICK_SNIPPETS.map((snippet) => (
                    <button
                      key={snippet.label}
                      type="button"
                      onClick={() => appendEditorHtml(snippet.value)}
                      className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 transition hover:border-gray-900 hover:text-gray-900"
                    >
                      {snippet.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => inlineImageInputRef.current?.click()}
                    disabled={inlineUploading}
                    className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 transition hover:border-gray-900 hover:text-gray-900 disabled:opacity-60"
                  >
                    {inlineUploading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <ImageIcon className="h-3.5 w-3.5" />
                    )}
                    İçerik görseli
                  </button>
                </div>

                <div
                  className={`grid gap-4 ${
                    editorMode === "split"
                      ? "grid-cols-1 xl:grid-cols-[minmax(0,1.35fr)_minmax(300px,1fr)]"
                      : "grid-cols-1"
                  }`}
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-semibold text-gray-900">Metin editoru</div>
                      <div className="text-xs text-gray-500">
                        {formData.wordCount} kelime / {editorMetrics.charCount} karakter
                      </div>
                    </div>
                    <RichTextEditor
                      value={formData.content}
                      onChange={(value) => patch({ content: value })}
                      placeholder="Blog yazinizi baslik, paragraf, liste, alinti ve baglanti yapisiyla buraya girin..."
                      minHeightClassName="min-h-[620px]"
                    />
                  </div>

                  {editorMode === "split" && (
                    <div className="space-y-4">
                      <div className="rounded-2xl border border-gray-200 bg-white">
                        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
                          <div className="text-sm font-semibold text-gray-900">Canli onizleme</div>
                          <div className="inline-flex items-center gap-1 text-xs text-gray-500">
                            <Eye className="h-3.5 w-3.5" />
                            rich text render
                          </div>
                        </div>
                        <div className="prose prose-gray max-w-none p-5">
                          {previewHtml ? (
                            <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
                          ) : (
                            <p className="text-sm text-gray-500">Henuz icerik yok.</p>
                          )}
                        </div>
                      </div>
                      <div className="rounded-2xl border border-gray-200 bg-white p-4">
                        <div className="mb-3 text-sm font-semibold text-gray-900">İçerik yapısı</div>
                        {outline.length > 0 ? (
                          <div className="space-y-2">
                            {outline.map((item, index) => (
                              <div
                                key={`${item.text}-${index}`}
                                className="text-sm text-gray-600"
                                style={{ paddingLeft: `${Math.max(item.level - 2, 0) * 12}px` }}
                              >
                                <span className="font-medium text-gray-900">H{item.level}</span>{" "}
                                {item.text}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-gray-500">
                            H2 ve H3 ekledikce burada bolum yapisi gorunur.
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="mb-4 text-sm font-semibold text-gray-900">Anahtar kelimeler</div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <label className="text-sm font-medium text-gray-700">
                Birincil kelime
                <input
                  type="text"
                  value={formData.primaryKeyword}
                  onChange={(event) => patch({ primaryKeyword: event.target.value })}
                  className="mt-2 w-full rounded-lg border border-gray-200 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              </label>
              <TokenInput
                label="Etiketler"
                values={formData.tags}
                onAdd={(value) => patch({ tags: [...formData.tags, value] })}
                onRemove={(value) => patch({ tags: formData.tags.filter((item) => item !== value) })}
              />
              <TokenInput
                label="Ikincil kelimeler"
                values={formData.targetKeywords}
                onAdd={(value) => patch({ targetKeywords: [...formData.targetKeywords, value] })}
                onRemove={(value) =>
                  patch({ targetKeywords: formData.targetKeywords.filter((item) => item !== value) })
                }
              />
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-gray-900">
              <BarChart3 className="h-4 w-4 text-gray-500" />
              SEO puani
            </div>
            <div className="flex items-center justify-center">
              <div
                className={`flex h-20 w-20 items-center justify-center rounded-full text-2xl font-bold ${
                  formData.seoScore >= 80
                    ? "bg-emerald-100 text-emerald-700"
                    : formData.seoScore >= 60
                      ? "bg-amber-100 text-amber-700"
                      : "bg-gray-100 text-gray-600"
                }`}
              >
                {formData.seoScore}
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <label className="text-sm font-medium text-gray-700">
              Yazar
              <input
                type="text"
                value={formData.author.name}
                onChange={(event) => patch({ author: { ...formData.author, name: event.target.value } })}
                className="mt-2 w-full rounded-lg border border-gray-200 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </label>
            <div className="mt-5">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium text-gray-700">Kapak gorseli</div>
                {formData.coverImage ? (
                  <button
                    type="button"
                    onClick={() => patch({ coverImage: "" })}
                    className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 transition hover:text-red-600"
                  >
                    <X className="h-3.5 w-3.5" />
                    Kaldir
                  </button>
                ) : null}
              </div>

              <div className="mt-2 rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-4">
                {formData.coverImage ? (
                  <div className="space-y-4">
                    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
                      <img
                        src={formData.coverImage}
                        alt="Blog kapak gorseli"
                        className="h-48 w-full object-cover"
                      />
                    </div>
                    <div className="rounded-lg bg-white px-3 py-2 text-xs text-gray-500">
                      {formData.coverImage}
                    </div>
                    <button
                      type="button"
                      onClick={() => coverInputRef.current?.click()}
                      disabled={coverUploading}
                      className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition hover:border-gray-900 hover:text-gray-900 disabled:opacity-60"
                    >
                      {coverUploading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Upload className="h-4 w-4" />
                      )}
                      Görseli değiştir
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex h-40 items-center justify-center rounded-xl border border-gray-200 bg-white">
                      <div className="text-center text-sm text-gray-500">
                        <ImageIcon className="mx-auto mb-2 h-6 w-6 text-gray-400" />
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => coverInputRef.current?.click()}
                      disabled={coverUploading}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800 disabled:opacity-60"
                    >
                      {coverUploading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Upload className="h-4 w-4" />
                      )}
                      Kapak gorseli yukle
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </form>
  );
}

function MetricPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-center shadow-sm">
      <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-gray-400">
        {label}
      </div>
      <div className="mt-1 text-sm font-semibold text-gray-900">{value}</div>
    </div>
  );
}

function TokenInput({
  label,
  values,
  onAdd,
  onRemove,
}: {
  label: string;
  values: string[];
  onAdd: (value: string) => void;
  onRemove: (value: string) => void;
}) {
  return (
    <div className="text-sm font-medium text-gray-700">
      {label}
      <input
        type="text"
        placeholder="Enter ile ekleyin"
        className="mt-2 w-full rounded-lg border border-gray-200 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
        onKeyDown={(event) => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          const value = event.currentTarget.value.trim();
          if (!value || values.includes(value)) return;
          onAdd(value);
          event.currentTarget.value = "";
        }}
      />
      <div className="mt-2 flex flex-wrap gap-2">
        {values.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => onRemove(value)}
            className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700 transition hover:bg-gray-200"
          >
            {value} x
          </button>
        ))}
      </div>
    </div>
  );
}
