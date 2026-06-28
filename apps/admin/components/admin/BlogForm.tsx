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
import { AdminPageHeader, AdminPageShell } from "@/components/admin/AdminPageShell";
import type { BlogPost, BlogCategory } from "@/types/blog";
import type { BlogStrategyCategory, BlogStrategyPillar } from "@/types/blog-strategy";

interface BlogFormProps {
  initialData?: BlogPost;
}

type EditorMode = "write" | "split" | "preview";

const PANEL_CLASS =
  "overflow-hidden rounded-[12px] border border-[#DCE3EC] bg-white shadow-[0_12px_30px_rgba(15,23,42,0.04)]";

const PANEL_HEADER_CLASS =
  "border-b border-[#DCE3EC] bg-[#EEF3F7] px-4 py-3 xl:px-5";

const FIELD_CLASS =
  "h-11 w-full rounded-[8px] border border-[#DCE3EC] bg-white px-3 text-sm text-[#111827] outline-none transition placeholder:text-[#8B95A5] focus:border-[#FFD1B5] focus:ring-4 focus:ring-[rgba(255,106,0,0.14)]";

const TEXTAREA_CLASS =
  "w-full rounded-[8px] border border-[#DCE3EC] bg-white px-3 py-3 text-sm text-[#111827] outline-none transition placeholder:text-[#8B95A5] focus:border-[#FFD1B5] focus:ring-4 focus:ring-[rgba(255,106,0,0.14)]";

const LABEL_CLASS = "block text-sm font-semibold text-[#374151]";

const SECONDARY_BUTTON =
  "inline-flex h-10 items-center justify-center gap-2 rounded-[8px] border border-[#DCE3EC] bg-white px-4 text-sm font-semibold text-[#374151] transition hover:border-[#FFD1B5] hover:bg-[#FFF8F3] hover:text-[#E85D04] disabled:cursor-not-allowed disabled:opacity-55";

const PRIMARY_BUTTON =
  "inline-flex h-10 items-center justify-center gap-2 rounded-[8px] bg-[#FF6A00] px-4 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(255,106,0,0.16)] transition hover:bg-[#E85D04] disabled:cursor-not-allowed disabled:opacity-55";

const CHIP_BUTTON =
  "inline-flex h-8 items-center justify-center rounded-full border border-[#DCE3EC] bg-white px-3 text-xs font-semibold text-[#4B5563] transition hover:border-[#FFD1B5] hover:bg-[#FFF8F3] hover:text-[#E85D04]";

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
      "<h2>Öne çıkan maddeler</h2><ul><li>Madde 1</li><li>Madde 2</li><li>Madde 3</li></ul>",
  },
  {
    label: "SSS blogu",
    value:
      "<h2>Sık sorulan sorular</h2><h3>Soru 1</h3><p>Cevap...</p><h3>Soru 2</h3><p>Cevap...</p>",
  },
  {
    label: "Karşılaştırma",
    value:
      "<h2>Karşılaştırma</h2><h3>Avantajlar</h3><ul><li>Avantaj 1</li><li>Avantaj 2</li></ul><h3>Dikkat edilmesi gerekenler</h3><ul><li>Not 1</li><li>Not 2</li></ul>",
  },
  {
    label: "Sonuç",
    value:
      "<hr /><h2>Sonuç</h2><p>Yazıyı kısa bir sonuç ile kapatın ve gerekiyorsa okuyucuyu ilgili kategoriye ya da ürüne yönlendirin.</p>",
  },
];

function createAltFromFileName(fileName: string) {
  const cleaned = fileName
    .replace(/\.[^/.]+$/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned || "blog görseli";
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
  const [editorMode, setEditorMode] = useState<EditorMode>("write");
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
      toast.success("Kapak görseli yüklendi.");
    } catch (error) {
      console.error("Blog cover upload error:", error);
      toast.error(error instanceof Error ? error.message : "Kapak görseli yüklenemedi.");
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
        throw new Error(result.error || "Blog yazısı kaydedilemedi.");
      }

      toast.success(initialData ? "Yazı güncellendi." : "Yazı oluşturuldu.");
      router.push("/admin/cms/blog");
      router.refresh();
    } catch (error) {
      console.error("Blog save error:", error);
      toast.error(error instanceof Error ? error.message : "Blog yazısı kaydedilemedi.");
    } finally {
      setLoading(false);
    }
  }

  const editorModeOptions: Array<{ id: EditorMode; label: string }> = [
    { id: "write", label: "Yaz" },
    { id: "split", label: "Böl" },
    { id: "preview", label: "Önizle" },
  ];

  return (
    <form className="space-y-4" onSubmit={submit}>
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

      <AdminPageShell>
        <AdminPageHeader
          sectionLabel="CMS"
          title={initialData ? "Yazıyı düzenle" : "Yeni yazı"}
          actions={
            <>
              <div className="inline-flex h-10 items-center rounded-[8px] border border-[#DCE3EC] bg-white p-1">
                {editorModeOptions.map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => setEditorMode(mode.id)}
                    className={`h-8 rounded-[7px] px-3 text-xs font-semibold transition ${
                      editorMode === mode.id
                        ? "bg-[#FF6A00] text-white shadow-[0_8px_18px_rgba(255,106,0,0.18)]"
                        : "text-[#4B5563] hover:bg-[#FFF8F3] hover:text-[#E85D04]"
                    }`}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
              <button
                type="submit"
                disabled={loading}
                className={PRIMARY_BUTTON}
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {formData.status === "published" ? "Yayınla" : "Kaydet"}
              </button>
            </>
          }
          metrics={
            <>
              <MetricCell label="Kelime" value={formData.wordCount.toLocaleString("tr-TR")} detail={`${guide.minWords}+ hedef`} />
              <MetricCell label="SEO" value={formData.seoScore.toLocaleString("tr-TR")} detail="puan" tone={formData.seoScore >= 80 ? "success" : formData.seoScore >= 60 ? "warning" : "neutral"} />
              <MetricCell label="Başlık" value={editorMetrics.headingCount.toLocaleString("tr-TR")} detail="bölüm" />
              <MetricCell label="Görsel" value={editorMetrics.imageCount.toLocaleString("tr-TR")} detail="medya" />
            </>
          }
        />

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-4">
            <section className={PANEL_CLASS}>
              <div className={PANEL_HEADER_CLASS}>
                <h2 className="text-sm font-semibold text-[#111827]">Yazı bilgileri</h2>
              </div>
              <div className="grid grid-cols-1 gap-4 p-4 md:grid-cols-2 xl:p-5">
                <label className={LABEL_CLASS}>
                  Başlık
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(event) =>
                      patch({
                        title: event.target.value,
                        slug: initialData ? formData.slug : slugify(event.target.value),
                      })
                    }
                    className={`mt-2 ${FIELD_CLASS}`}
                  />
                </label>
                <label className={LABEL_CLASS}>
                  Slug
                  <input
                    type="text"
                    value={formData.slug}
                    onChange={(event) => patch({ slug: slugify(event.target.value) })}
                    className={`mt-2 font-mono ${FIELD_CLASS}`}
                  />
                </label>
                <label className={LABEL_CLASS}>
                  Kategori
                  <select
                    value={formData.category}
                    onChange={(event) => patch({ category: event.target.value as BlogCategory })}
                    className={`mt-2 ${FIELD_CLASS}`}
                  >
                    {categories.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={LABEL_CLASS}>
                  Durum
                  <select
                    value={formData.status}
                    onChange={(event) => patch({ status: event.target.value as BlogPost["status"] })}
                    className={`mt-2 ${FIELD_CLASS}`}
                  >
                    <option value="draft">Taslak</option>
                    <option value="published">Yayında</option>
                    <option value="archived">Arşiv</option>
                  </select>
                </label>

                <label className={`${LABEL_CLASS} md:col-span-2`}>
                  Kısa özet
                  <textarea
                    rows={3}
                    value={formData.excerpt}
                    onChange={(event) => patch({ excerpt: event.target.value })}
                    className={`mt-2 ${TEXTAREA_CLASS}`}
                  />
                </label>
              </div>
            </section>

            {!initialData && (
              <section className={PANEL_CLASS}>
                <div className={PANEL_HEADER_CLASS}>
                  <h2 className="text-sm font-semibold text-[#111827]">İçerik tipi</h2>
                </div>
                <div className="space-y-4 p-4 xl:p-5">
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    {([
                      { id: "pillar", label: "Ana konu" },
                      { id: "cluster", label: "Destek yazı" },
                      { id: "standalone", label: "Bağımsız" },
                    ] as const).map((type) => (
                      <button
                        key={type.id}
                        type="button"
                        onClick={() =>
                          patch({
                            topicType: type.id,
                            pillarId: type.id === "cluster" ? formData.pillarId : null,
                          })
                        }
                        className={`rounded-[10px] border px-4 py-3 text-left text-sm transition ${
                          formData.topicType === type.id
                            ? "border-[#FFD1B5] bg-[#FFF8F3] text-[#E85D04]"
                            : "border-[#DCE3EC] bg-white text-[#4B5563] hover:border-[#FFD1B5] hover:bg-[#FFF8F3]"
                        }`}
                      >
                        <div className="font-semibold">{type.label}</div>
                        <div className="mt-1 text-xs text-[#6B7280]">
                          {CONTENT_GUIDELINES[type.id].minWords}+ kelime
                        </div>
                      </button>
                    ))}
                  </div>
                  {formData.topicType === "cluster" && (
                    <label className={LABEL_CLASS}>
                      Bağlı ana konu
                      <select
                        value={formData.pillarId || ""}
                        onChange={(event) => patch({ pillarId: event.target.value || null })}
                        className={`mt-2 ${FIELD_CLASS}`}
                      >
                        <option value="">Ana konu seçin...</option>
                        {pillars.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.title}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>
              </section>
            )}

            <section className={PANEL_CLASS}>
            <div className={PANEL_HEADER_CLASS}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-[#111827]">İçerik</div>
                  <div className="mt-1 text-xs font-medium text-[#6B7280]">
                    {formData.wordCount} kelime, hedef {guide.minWords}+
                  </div>
                </div>
                <div className="w-28 rounded-full bg-white p-1">
                  <div
                    className={`h-2 rounded-full ${
                      formData.wordCount >= guide.minWords ? "bg-emerald-500" : "bg-[#FF6A00]"
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
                <MetricPill label="Başlık" value={String(editorMetrics.headingCount)} />
                <MetricPill label="Link" value={String(editorMetrics.linkCount)} />
                <MetricPill label="Görsel" value={String(editorMetrics.imageCount)} />
              </div>
            </div>

            {editorMode === "preview" ? (
              <div
                className="prose prose-gray max-w-none p-4 xl:p-5"
                dangerouslySetInnerHTML={{ __html: previewHtml || "<p>Henüz içerik yok.</p>" }}
              />
            ) : (
              <div className="space-y-4 p-4 xl:p-5">
                <div className="flex flex-wrap gap-2">
                  {QUICK_SNIPPETS.map((snippet) => (
                    <button
                      key={snippet.label}
                      type="button"
                      onClick={() => appendEditorHtml(snippet.value)}
                      className={CHIP_BUTTON}
                    >
                      {snippet.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => inlineImageInputRef.current?.click()}
                    disabled={inlineUploading}
                    className={CHIP_BUTTON}
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
                      <div className="text-sm font-semibold text-[#111827]">Metin editörü</div>
                      <div className="text-xs font-medium text-[#6B7280]">
                        {formData.wordCount} kelime / {editorMetrics.charCount} karakter
                      </div>
                    </div>
                    <RichTextEditor
                      value={formData.content}
                      onChange={(value) => patch({ content: value })}
                      placeholder="Blog yazınızı buraya girin..."
                      minHeightClassName="min-h-[520px]"
                    />
                  </div>

                  {editorMode === "split" && (
                    <div className="space-y-4">
                      <div className="overflow-hidden rounded-[12px] border border-[#DCE3EC] bg-white">
                        <div className="flex items-center justify-between border-b border-[#DCE3EC] bg-[#EEF3F7] px-4 py-3">
                          <div className="text-sm font-semibold text-[#111827]">Önizleme</div>
                          <div className="inline-flex items-center gap-1 text-xs font-medium text-[#6B7280]">
                            <Eye className="h-3.5 w-3.5" />
                            canlı
                          </div>
                        </div>
                        <div className="prose prose-gray max-w-none p-5">
                          {previewHtml ? (
                            <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
                          ) : (
                            <p className="text-sm text-[#6B7280]">Henüz içerik yok.</p>
                          )}
                        </div>
                      </div>
                      <div className="rounded-[12px] border border-[#DCE3EC] bg-white p-4">
                        <div className="mb-3 text-sm font-semibold text-[#111827]">İçerik yapısı</div>
                        {outline.length > 0 ? (
                          <div className="space-y-2">
                            {outline.map((item, index) => (
                              <div
                                key={`${item.text}-${index}`}
                                className="text-sm text-[#4B5563]"
                                style={{ paddingLeft: `${Math.max(item.level - 2, 0) * 12}px` }}
                              >
                                <span className="font-semibold text-[#111827]">H{item.level}</span>{" "}
                                {item.text}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-[#6B7280]">
                            H2 ve H3 ekledikçe yapı burada görünür.
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>

          <section className={PANEL_CLASS}>
            <div className={PANEL_HEADER_CLASS}>
              <h2 className="text-sm font-semibold text-[#111827]">Anahtar kelimeler</h2>
            </div>
            <div className="grid grid-cols-1 gap-4 p-4 md:grid-cols-2 xl:p-5">
              <label className={LABEL_CLASS}>
                Birincil kelime
                <input
                  type="text"
                  value={formData.primaryKeyword}
                  onChange={(event) => patch({ primaryKeyword: event.target.value })}
                  className={`mt-2 ${FIELD_CLASS}`}
                />
              </label>
              <TokenInput
                label="Etiketler"
                values={formData.tags}
                onAdd={(value) => patch({ tags: [...formData.tags, value] })}
                onRemove={(value) => patch({ tags: formData.tags.filter((item) => item !== value) })}
              />
              <TokenInput
                label="İkincil kelimeler"
                values={formData.targetKeywords}
                onAdd={(value) => patch({ targetKeywords: [...formData.targetKeywords, value] })}
                onRemove={(value) =>
                  patch({ targetKeywords: formData.targetKeywords.filter((item) => item !== value) })
                }
              />
            </div>
          </section>
        </div>

        <div className="space-y-4">
          <section className={PANEL_CLASS}>
            <div className={PANEL_HEADER_CLASS}>
              <div className="flex items-center gap-2 text-sm font-semibold text-[#111827]">
                <BarChart3 className="h-4 w-4 text-[#FF6A00]" />
                SEO puanı
              </div>
            </div>
            <div className="flex items-center justify-center p-5">
              <div
                className={`flex h-20 w-20 items-center justify-center rounded-full text-2xl font-bold ${
                  formData.seoScore >= 80
                    ? "bg-emerald-100 text-emerald-700"
                    : formData.seoScore >= 60
                      ? "bg-amber-100 text-amber-700"
                      : "bg-[#FFF3EA] text-[#E85D04]"
                }`}
              >
                {formData.seoScore}
              </div>
            </div>
          </section>

          <section className={PANEL_CLASS}>
            <div className={PANEL_HEADER_CLASS}>
              <h2 className="text-sm font-semibold text-[#111827]">Yazar ve kapak</h2>
            </div>
            <div className="space-y-5 p-4 xl:p-5">
            <label className={LABEL_CLASS}>
              Yazar
              <input
                type="text"
                value={formData.author.name}
                onChange={(event) => patch({ author: { ...formData.author, name: event.target.value } })}
                className={`mt-2 ${FIELD_CLASS}`}
              />
            </label>
            <div>
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-[#374151]">Kapak görseli</div>
                {formData.coverImage ? (
                  <button
                    type="button"
                    onClick={() => patch({ coverImage: "" })}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 transition hover:text-red-700"
                  >
                    <X className="h-3.5 w-3.5" />
                    Kaldır
                  </button>
                ) : null}
              </div>

              <div className="mt-2 rounded-[12px] border border-dashed border-[#DCE3EC] bg-[#F9F9F9] p-3">
                {formData.coverImage ? (
                  <div className="space-y-4">
                    <div className="overflow-hidden rounded-[10px] border border-[#DCE3EC] bg-white">
                      <img
                        src={formData.coverImage}
                        alt="Blog kapak görseli"
                        className="h-40 w-full object-cover"
                      />
                    </div>
                    <div className="truncate rounded-[8px] bg-white px-3 py-2 text-xs font-medium text-[#6B7280]">
                      {formData.coverImage}
                    </div>
                    <button
                      type="button"
                      onClick={() => coverInputRef.current?.click()}
                      disabled={coverUploading}
                      className={SECONDARY_BUTTON}
                    >
                      {coverUploading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Upload className="h-4 w-4" />
                      )}
                      Değiştir
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex h-32 items-center justify-center rounded-[10px] border border-[#DCE3EC] bg-white">
                      <div className="text-center text-sm text-[#6B7280]">
                        <ImageIcon className="mx-auto h-6 w-6 text-[#FF6A00]" />
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => coverInputRef.current?.click()}
                      disabled={coverUploading}
                      className={PRIMARY_BUTTON}
                    >
                      {coverUploading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Upload className="h-4 w-4" />
                      )}
                      Kapak yükle
                    </button>
                  </div>
                )}
              </div>
            </div>
            </div>
          </section>
        </div>
      </div>
      </AdminPageShell>
    </form>
  );
}

function MetricPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[8px] border border-[#DCE3EC] bg-white px-3 py-2 text-center">
      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8B95A5]">{label}</div>
      <div className="mt-1 text-sm font-semibold text-[#111827]">{value}</div>
    </div>
  );
}

function MetricCell({
  label,
  value,
  detail,
  tone = "neutral",
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "neutral" | "success" | "warning";
}) {
  return (
    <div className="min-h-[92px] bg-white px-4 py-3.5 xl:px-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#6B7280]">{label}</p>
        <span
          className={`h-2 w-2 rounded-full ${
            tone === "success" ? "bg-emerald-500" : tone === "warning" ? "bg-amber-500" : "bg-[#FF6A00]"
          }`}
        />
      </div>
      <p className="mt-3 truncate text-2xl font-semibold tracking-[-0.04em] text-[#111827]">{value}</p>
      <p className="mt-1 truncate text-xs font-medium text-[#6B7280]">{detail}</p>
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
    <div className={LABEL_CLASS}>
      {label}
      <input
        type="text"
        placeholder="Enter ile ekleyin"
        className={`mt-2 ${FIELD_CLASS}`}
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
            className="rounded-full border border-[#FFD1B5] bg-[#FFF3EA] px-3 py-1 text-xs font-semibold text-[#E85D04] transition hover:bg-[#FFE7D4]"
          >
            {value} ×
          </button>
        ))}
      </div>
    </div>
  );
}
