"use client";

import { useState, useEffect } from "react";
import {
  Save,
  ArrowLeft,
  Eye,
  Settings,
  Trash2,
  Image as ImageIcon,
  Type,
  Target,
  CheckCircle2,
  AlertCircle,
  FileText,
  Link2,
  TrendingUp,
  Lightbulb,
  Hash,
  BarChart3,
} from "lucide-react";
import Link from "next/link";
import { BlogPost, BlogCategory, TopicType } from "@/types/blog";
import { BLOG_CATEGORIES, SUGGESTED_PILLARS, SEO_CHECKLIST, CONTENT_GUIDELINES, calculateSEOScore } from "@/lib/blog";

interface BlogFormProps {
  initialData?: BlogPost;
}

export function BlogForm({ initialData }: BlogFormProps) {
  const [loading, setLoading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [formData, setFormData] = useState<Partial<BlogPost>>(
    initialData || {
      title: "",
      slug: "",
      excerpt: "",
      content: "",
      coverImage: "",
      category: "saglik",
      tags: [],
      featured: false,
      topicType: "standalone",
      pillarId: null,
      targetKeywords: [],
      primaryKeyword: "",
      wordCount: 0,
      seoScore: 0,
      internalLinks: [],
      relatedProducts: [],
      author: {
        name: "Admin",
        role: "Editör",
        avatar: "",
      },
    }
  );

  // SEO skorunu hesapla
  useEffect(() => {
    const score = calculateSEOScore(formData);
    setFormData((prev) => ({ ...prev, seoScore: score }));
  }, [
    formData.title,
    formData.excerpt,
    formData.content,
    formData.primaryKeyword,
    formData.targetKeywords,
    formData.internalLinks,
    formData.relatedProducts,
    formData.coverImage,
    formData.tags,
  ]);

  // Kelime sayısını hesapla
  useEffect(() => {
    const text = formData.content || "";
    const wordCount = text.trim().split(/\s+/).filter((w) => w.length > 0).length;
    setFormData((prev) => ({ ...prev, wordCount }));
  }, [formData.content]);

  const generateSlug = (title: string) => {
    return title
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, "")
      .replace(/[\s_-]+/g, "-")
      .replace(/^-+|-+$/g, "");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setLoading(false);
    alert("Yazı başarıyla kaydedildi.");
  };

  const guidelines = CONTENT_GUIDELINES[formData.topicType || "standalone"];
  const wordCountProgress = Math.min(((formData.wordCount || 0) / guidelines.minWords) * 100, 100);

  // Pillar seçenekleri
  const pillars = []; // Gerçek veriden gelecek

  return (
    <div className="space-y-8">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/admin/cms/blog"
            className="p-2 hover:bg-white rounded-lg transition-colors border border-transparent hover:border-gray-200"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
              {initialData ? "Yazıyı Düzenle" : "Yeni Yazı Ekle"}
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              {formData.topicType === "pillar"
                ? "Kapsamlı bir ana konu rehberi oluşturun"
                : formData.topicType === "cluster"
                ? "Bir pillar'a bağlı detaylı içerik yazın"
                : "Bağımsız bir blog yazısı oluşturun"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setShowPreview(!showPreview)}
            className={`inline-flex items-center gap-2 px-4 py-2 border rounded-lg text-sm font-medium transition-all ${
              showPreview
                ? "bg-gray-100 border-gray-300 text-gray-900"
                : "bg-white border-gray-200 text-gray-600 hover:border-gray-900 hover:text-gray-900 shadow-sm"
            }`}
          >
            <Eye className="w-4 h-4" />
            {showPreview ? "Düzenlemeye Dön" : "Önizleme"}
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="inline-flex items-center gap-2 px-6 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors shadow-sm disabled:opacity-50"
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {initialData ? "Değişiklikleri Kaydet" : "Yayınla"}
          </button>
        </div>
      </div>

      {/* Content Type Selector */}
      {!initialData && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-3">
            <Target className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium text-gray-900">İçerik Tipi</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <button
              type="button"
              onClick={() => setFormData({ ...formData, topicType: "pillar", pillarId: null })}
              className={`p-4 rounded-xl border-2 text-left transition-all ${
                formData.topicType === "pillar"
                  ? "border-purple-500 bg-purple-50"
                  : "border-gray-200 hover:border-purple-300"
              }`}
            >
              <div className="font-semibold text-gray-900 mb-1">Pillar (Ana Konu)</div>
              <div className="text-xs text-gray-500">{CONTENT_GUIDELINES.pillar.minWords}+ kelime</div>
              <div className="text-xs text-gray-400 mt-1">Kapsamlı rehber</div>
            </button>
            <button
              type="button"
              onClick={() => setFormData({ ...formData, topicType: "cluster" })}
              className={`p-4 rounded-xl border-2 text-left transition-all ${
                formData.topicType === "cluster"
                  ? "border-blue-500 bg-blue-50"
                  : "border-gray-200 hover:border-blue-300"
              }`}
            >
              <div className="font-semibold text-gray-900 mb-1">Cluster (Alt Konu)</div>
              <div className="text-xs text-gray-500">{CONTENT_GUIDELINES.cluster.minWords}+ kelime</div>
              <div className="text-xs text-gray-400 mt-1">Detaylı içerik</div>
            </button>
            <button
              type="button"
              onClick={() => setFormData({ ...formData, topicType: "standalone", pillarId: null })}
              className={`p-4 rounded-xl border-2 text-left transition-all ${
                formData.topicType === "standalone"
                  ? "border-gray-500 bg-gray-50"
                  : "border-gray-200 hover:border-gray-300"
              }`}
            >
              <div className="font-semibold text-gray-900 mb-1">Bağımsız Yazı</div>
              <div className="text-xs text-gray-500">{CONTENT_GUIDELINES.standalone.minWords}+ kelime</div>
              <div className="text-xs text-gray-400 mt-1">Tekil blog yazısı</div>
            </button>
          </div>

          {/* Pillar Selection for Cluster */}
          {formData.topicType === "cluster" && (
            <div className="mt-4 p-4 bg-blue-50 rounded-xl border border-blue-200">
              <label className="block text-sm font-medium text-gray-700 mb-2">Bağlı Olduğu Pillar</label>
              <select
                value={formData.pillarId || ""}
                onChange={(e) => setFormData({ ...formData, pillarId: e.target.value || null })}
                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all bg-white text-sm"
              >
                <option value="">Pillar seçin...</option>
                {SUGGESTED_PILLARS.map((pillar) => (
                  <option key={pillar.id} value={pillar.id}>
                    {pillar.title}
                  </option>
                ))}
              </select>
              <p className="text-xs text-blue-600 mt-2">
                Cluster yazıları bir pillar'a bağlı detaylı içeriklerdir.
              </p>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          {showPreview ? (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 min-h-[600px] prose prose-gray max-w-none">
              <h1 className="text-3xl font-bold mb-6">{formData.title || "Başlıksız Yazı"}</h1>
              {formData.coverImage && (
                <img src={formData.coverImage} className="w-full h-64 object-cover rounded-xl mb-8" alt="Kapak" />
              )}
              <div className="whitespace-pre-wrap text-gray-700 leading-relaxed">
                {formData.content || "Henüz içerik girilmedi..."}
              </div>
            </div>
          ) : (
            <>
              {/* Main Content Card */}
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-gray-100 bg-gray-50/50">
                  <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                    <Type className="w-4 h-4 text-gray-500" />
                    İçerik Editörü
                  </h3>
                </div>
                <div className="p-6 space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Yazı Başlığı
                      {formData.topicType === "pillar" && (
                        <span className="ml-2 text-xs text-purple-600 font-normal">(Pillar: Kapsamlı ve çekici olmalı)</span>
                      )}
                    </label>
                    <input
                      type="text"
                      value={formData.title}
                      onChange={(e) => {
                        const newTitle = e.target.value;
                        setFormData((prev) => ({
                          ...prev,
                          title: newTitle,
                          slug: !initialData ? generateSlug(newTitle) : prev.slug,
                        }));
                      }}
                      placeholder={
                        formData.topicType === "pillar"
                          ? "Örn: Fıstık Ezmesi Rehberi: Faydaları, Kullanımı ve Tarifleri"
                          : "Örn: 2026'nın En Sağlıklı Ezmeleri"
                      }
                      className="w-full px-4 py-2 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 transition-all text-sm font-medium"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Bağlantı (Slug)</label>
                      <input
                        type="text"
                        value={formData.slug}
                        onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 transition-all text-sm font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Kategori</label>
                      <select
                        value={formData.category}
                        onChange={(e) => setFormData({ ...formData, category: e.target.value as BlogCategory })}
                        className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 transition-all bg-white text-sm"
                      >
                        {BLOG_CATEGORIES.map((cat) => (
                          <option key={cat.id} value={cat.id}>
                            {cat.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Kısa Özet
                      <span className="ml-2 text-xs text-gray-400 font-normal">(Meta açıklama için kullanılır, 150-160 karakter)</span>
                    </label>
                    <textarea
                      rows={2}
                      value={formData.excerpt}
                      onChange={(e) => setFormData({ ...formData, excerpt: e.target.value })}
                      placeholder="Yazının kısa bir özeti (liste sayfalarında görünür)..."
                      className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 transition-all text-sm resize-none"
                    />
                    <div className="text-xs text-gray-400 mt-1 text-right">{(formData.excerpt || "").length} karakter</div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      İçerik
                      {formData.wordCount > 0 && (
                        <span
                          className={`ml-2 text-xs font-normal ${
                            formData.wordCount >= guidelines.minWords ? "text-emerald-600" : "text-amber-600"
                          }`}
                        >
                          ({formData.wordCount} / {guidelines.minWords} kelime)
                        </span>
                      )}
                    </label>
                    {/* Word Count Progress */}
                    <div className="mb-2 w-full bg-gray-200 rounded-full h-1.5">
                      <div
                        className={`h-1.5 rounded-full transition-all ${
                          wordCountProgress >= 100 ? "bg-emerald-500" : "bg-amber-500"
                        }`}
                        style={{ width: `${Math.max(wordCountProgress, 5)}%` }}
                      />
                    </div>
                    <textarea
                      rows={12}
                      value={formData.content}
                      onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                      placeholder={
                        formData.topicType === "pillar"
                          ? "Kapsamlı bir rehber yazın. Giriş, ana bölümler, alt başlıklar ve sonuç ekleyin..."
                          : "Detaylı içerik yazın. Spesifik bir konuyu derinlemesine ele alın..."
                      }
                      className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 transition-all text-sm resize-none font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* SEO Keywords Card */}
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-gray-100 bg-gray-50/50">
                  <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                    <Hash className="w-4 h-4 text-gray-500" />
                    Anahtar Kelimeler
                  </h3>
                </div>
                <div className="p-6 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Birincil Anahtar Kelime
                      <span className="ml-2 text-xs text-gray-400 font-normal">(En önemli hedef kelime)</span>
                    </label>
                    <input
                      type="text"
                      value={formData.primaryKeyword}
                      onChange={(e) => setFormData({ ...formData, primaryKeyword: e.target.value })}
                      placeholder="Örn: fıstık ezmesi"
                      className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 transition-all text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">İkincil Anahtar Kelimeler</label>
                    <input
                      type="text"
                      placeholder="Virgül ile ayırarak yazın ve Enter'a basın..."
                      className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 transition-all text-sm"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          const val = e.currentTarget.value.trim();
                          if (val && !formData.targetKeywords?.includes(val)) {
                            setFormData({
                              ...formData,
                              targetKeywords: [...(formData.targetKeywords || []), val],
                            });
                            e.currentTarget.value = "";
                          }
                        }
                      }}
                    />
                    <div className="mt-2 flex flex-wrap gap-2">
                      {formData.targetKeywords?.map((kw) => (
                        <span
                          key={kw}
                          className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-purple-100 text-purple-700 text-sm"
                        >
                          {kw}
                          <button
                            onClick={() =>
                              setFormData({
                                ...formData,
                                targetKeywords: formData.targetKeywords?.filter((k) => k !== kw),
                              })
                            }
                            className="hover:text-purple-900"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* SEO Score Card */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-gray-100 bg-gray-50/50">
              <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-gray-500" />
                SEO Puanı
              </h3>
            </div>
            <div className="p-4">
              <div className="flex items-center justify-center mb-4">
                <div
                  className={`w-20 h-20 rounded-full flex items-center justify-center text-2xl font-bold ${
                    (formData.seoScore || 0) >= 80
                      ? "bg-emerald-100 text-emerald-700"
                      : (formData.seoScore || 0) >= 60
                      ? "bg-amber-100 text-amber-700"
                      : "bg-gray-100 text-gray-600"
                  }`}
                >
                  {formData.seoScore || 0}
                </div>
              </div>
              <div className="text-center text-sm text-gray-600 mb-4">
                {(formData.seoScore || 0) >= 80
                  ? "Harika! SEO optimizasyonu çok iyi."
                  : (formData.seoScore || 0) >= 60
                  ? "İyi, ama daha da geliştirilebilir."
                  : "SEO optimizasyonu gerekiyor."}
              </div>

              {/* SEO Checklist */}
              <div className="space-y-2">
                {SEO_CHECKLIST.map((item) => (
                  <div key={item.id} className="flex items-center gap-2 text-sm">
                    <CheckCircle2 className="w-4 h-4 text-gray-300" />
                    <span className="text-gray-600">{item.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Cover Image Card */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-gray-100 bg-gray-50/50">
              <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-gray-500" />
                Kapak Görseli
              </h3>
            </div>
            <div className="p-4 space-y-4">
              {formData.coverImage ? (
                <div className="relative group rounded-lg overflow-hidden h-40">
                  <img src={formData.coverImage} alt="Kapak" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center">
                    <button
                      onClick={() => setFormData({ ...formData, coverImage: "" })}
                      className="p-2 bg-white text-red-600 rounded-full hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="h-40 border-2 border-dashed border-gray-200 rounded-lg flex flex-col items-center justify-center gap-2 text-gray-400">
                  <ImageIcon className="w-8 h-8 opacity-20" />
                  <span className="text-xs">Görsel seçilmedi</span>
                </div>
              )}
              <input
                type="text"
                placeholder="Görsel URL yapıştırın..."
                value={formData.coverImage}
                onChange={(e) => setFormData({ ...formData, coverImage: e.target.value })}
                className="w-full px-3 py-1.5 text-xs border border-gray-200 rounded-md focus:border-gray-900 focus:ring-0"
              />
            </div>
          </div>

          {/* Content Guidelines Card */}
          <div className="bg-gradient-to-br from-purple-50 to-blue-50 rounded-xl border border-purple-100 p-4">
            <div className="flex items-center gap-2 mb-3">
              <Lightbulb className="w-4 h-4 text-purple-600" />
              <span className="text-sm font-semibold text-gray-900">İçerik Rehberi</span>
            </div>
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-gray-600">Tip:</span>
                <span className="font-medium text-gray-900 capitalize">{formData.topicType}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-600">Min. Kelime:</span>
                <span className="font-medium text-gray-900">{guidelines.minWords}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-600">İdeal Kelime:</span>
                <span className="font-medium text-gray-900">{guidelines.idealWords}</span>
              </div>
              <p className="text-xs text-gray-500 mt-2 pt-2 border-t border-purple-200">{guidelines.description}</p>
            </div>
          </div>

          {/* Settings Card */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-gray-100 bg-gray-50/50">
              <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                <Settings className="w-4 h-4 text-gray-500" />
                Yazı Ayarları
              </h3>
            </div>
            <div className="p-4 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Öne Çıkarılan Yazı</span>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, featured: !formData.featured })}
                  className={`w-10 h-5 rounded-full transition-colors relative ${
                    formData.featured ? "bg-gray-900" : "bg-gray-200"
                  }`}
                >
                  <div
                    className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all ${
                      formData.featured ? "left-6" : "left-1"
                    }`}
                  />
                </button>
              </div>

              <div className="pt-4 border-t border-gray-100">
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-2">Yazar</label>
                <div className="flex items-center gap-2 p-2 rounded-lg bg-gray-50 border border-gray-200">
                  <div className="w-8 h-8 rounded-full bg-gray-200 overflow-hidden">
                    {formData.author?.avatar && <img src={formData.author.avatar} alt="Yazar" />}
                  </div>
                  <div>
                    <div className="text-sm font-medium text-gray-900">{formData.author?.name}</div>
                    <div className="text-[10px] text-gray-500">{formData.author?.role}</div>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-2">Etiketler</label>
                <input
                  type="text"
                  placeholder="Virgül ile ayırın..."
                  className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-md focus:border-gray-900 focus:ring-0"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const val = e.currentTarget.value.trim();
                      if (val && !formData.tags?.includes(val)) {
                        setFormData({ ...formData, tags: [...(formData.tags || []), val] });
                        e.currentTarget.value = "";
                      }
                    }
                  }}
                />
                <div className="mt-2 flex flex-wrap gap-1">
                  {formData.tags?.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-gray-100 text-[10px] font-medium text-gray-600"
                    >
                      {tag}
                      <button
                        onClick={() =>
                          setFormData({ ...formData, tags: formData.tags?.filter((t) => t !== tag) })
                        }
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
