"use client";

import { Search, Check, AlertTriangle, Globe } from "lucide-react";
import { STORE_RUNTIME } from "@/lib/store-runtime";
import { cn } from "@/lib/utils";
import type { ProductSEO } from "@/types/product";
import { useEffect, useState } from "react";

interface StepSEOProps {
  seo: ProductSEO;
  productName: string;
  productDescription: string;
  onChange: (seo: ProductSEO) => void;
  errors: Record<string, string>;
}

export function StepSEO({ seo, productName, productDescription, onChange, errors }: StepSEOProps) {
  const [keywordInput, setKeywordInput] = useState("");
  const storeHost = STORE_RUNTIME.storefrontUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");

  // Auto-generate SEO fields from product data if empty
  useEffect(() => {
    const nextSeo: Partial<ProductSEO> = {};

    if (!seo.title && productName) {
      nextSeo.title = `${productName} | ${STORE_RUNTIME.defaultProductBrand}`;
    }

    if (!seo.description && productDescription) {
      nextSeo.description = productDescription.slice(0, 160);
    }

    if (Object.keys(nextSeo).length > 0) {
      onChange({ ...seo, ...nextSeo });
    }
  }, [onChange, productDescription, productName, seo]);

  const calculateSEOScore = () => {
    let score = 0;
    const checks = [];

    if (seo.title.length >= 30 && seo.title.length <= 70) {
      score += 20;
      checks.push({ id: 'title', status: 'success', message: 'Başlık uzunluğu uygun' });
    } else {
      checks.push({ id: 'title', status: 'warning', message: 'Başlık 30-70 karakter arası olmalı' });
    }

    if (seo.description.length >= 120 && seo.description.length <= 160) {
      score += 20;
      checks.push({ id: 'description', status: 'success', message: 'Meta description dolu' });
    } else {
      checks.push({ id: 'description', status: 'warning', message: 'Meta description 120-160 karakter olmalı' });
    }

    if (seo.keywords.length >= 3) {
      score += 15;
      checks.push({ id: 'keywords', status: 'success', message: 'Anahtar kelimeler var' });
    } else {
      checks.push({ id: 'keywords', status: 'warning', message: 'En az 3 anahtar kelime ekleyin' });
    }

    if (seo.focusKeyword) {
      score += 15;
      checks.push({ id: 'focus', status: 'success', message: 'Focus anahtar kelime belirlenmiş' });
    } else {
      checks.push({ id: 'focus', status: 'warning', message: 'Focus anahtar kelime ekleyin' });
    }

    if (seo.title.toLowerCase().includes(seo.focusKeyword?.toLowerCase() || '')) {
      score += 15;
      checks.push({ id: 'title_keyword', status: 'success', message: 'Başlıkta anahtar kelime var' });
    }

    if (seo.description.toLowerCase().includes(seo.focusKeyword?.toLowerCase() || '')) {
      score += 15;
      checks.push({ id: 'desc_keyword', status: 'success', message: 'Açıklamada anahtar kelime var' });
    }

    return { score: Math.min(score, 100), checks };
  };

  const { score, checks } = calculateSEOScore();

  const addKeyword = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const keyword = keywordInput.trim().toLowerCase();
      if (keyword && !seo.keywords.includes(keyword)) {
        onChange({ ...seo, keywords: [...seo.keywords, keyword] });
      }
      setKeywordInput("");
    }
  };

  const removeKeyword = (index: number) => {
    onChange({ ...seo, keywords: seo.keywords.filter((_, i) => i !== index) });
  };

  return (
    <div className="p-8 space-y-8">
      <div className="flex items-center gap-4 pb-6 border-b border-gray-100">
        <div className="w-12 h-12 bg-indigo-500 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
          <Search className="w-6 h-6" />
        </div>
        <div>
          <h3 className="text-xl font-bold text-gray-900">SEO & Meta</h3>
          <p className="text-sm text-gray-500">Arama motoru optimizasyonu</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column - SEO Inputs */}
        <div className="lg:col-span-2 space-y-6">
          {/* Focus Keyword */}
          <div className="space-y-2">
            <label className="text-sm font-bold text-gray-700">
              Focus Anahtar Kelime <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={seo.focusKeyword || ""}
              onChange={(e) => onChange({ ...seo, focusKeyword: e.target.value })}
              placeholder="Ana hedef anahtar kelime (örn: fıstık ezmesi)"
              className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
            />
            <p className="text-xs text-gray-500">
              Bu kelime başlık ve açıklamada geçmeli
            </p>
          </div>

          {/* Meta Title */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-bold text-gray-700">
                Sayfa Başlığı (Meta Title) <span className="text-rose-500">*</span>
              </label>
              <span className={cn(
                "text-xs font-medium",
                seo.title.length > 70 ? "text-rose-500" : "text-gray-400"
              )}>
                {seo.title.length}/70
              </span>
            </div>
            <input
              type="text"
              value={seo.title}
              onChange={(e) => onChange({ ...seo, title: e.target.value })}
              maxLength={70}
              className={cn(
                "w-full px-4 py-3 bg-white border rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all",
                errors.seoTitle ? "border-rose-300" : "border-gray-200"
              )}
            />
            {errors.seoTitle && (
              <p className="text-xs text-rose-500">{errors.seoTitle}</p>
            )}
          </div>

          {/* Meta Description */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-bold text-gray-700">
                Meta Açıklaması <span className="text-rose-500">*</span>
              </label>
              <span className={cn(
                "text-xs font-medium",
                seo.description.length > 160 ? "text-rose-500" : "text-gray-400"
              )}>
                {seo.description.length}/160
              </span>
            </div>
            <textarea
              value={seo.description}
              onChange={(e) => onChange({ ...seo, description: e.target.value })}
              maxLength={160}
              rows={4}
              className={cn(
                "w-full px-4 py-3 bg-white border rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all resize-none",
                errors.seoDescription ? "border-rose-300" : "border-gray-200"
              )}
            />
            {errors.seoDescription && (
              <p className="text-xs text-rose-500">{errors.seoDescription}</p>
            )}
          </div>

          {/* Keywords */}
          <div className="space-y-2">
            <label className="text-sm font-bold text-gray-700">Anahtar Kelimeler</label>
            <input
              type="text"
              value={keywordInput}
              onChange={(e) => setKeywordInput(e.target.value)}
              onKeyPress={addKeyword}
              placeholder="Anahtar kelime ekle (Enter)"
              className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
            />
            <div className="flex flex-wrap gap-2">
              {seo.keywords.map((keyword, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center gap-1 px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-lg text-sm font-medium"
                >
                  {keyword}
                  <button
                    type="button"
                    onClick={() => removeKeyword(idx)}
                    className="hover:text-indigo-900"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>

          {/* Robots Meta */}
          <div className="space-y-2">
            <label className="text-sm font-bold text-gray-700">Robots Meta</label>
            <select
              value={seo.robots}
              onChange={(e) => onChange({ ...seo, robots: e.target.value as ProductSEO["robots"] })}
              className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
            >
              <option value="index,follow">Index, Follow (Varsayılan)</option>
              <option value="noindex,follow">No Index, Follow</option>
              <option value="index,nofollow">Index, No Follow</option>
              <option value="noindex,nofollow">No Index, No Follow</option>
            </select>
          </div>

          {/* Canonical URL */}
          <div className="space-y-2">
            <label className="text-sm font-bold text-gray-700">Canonical URL (Opsiyonel)</label>
            <div className="relative">
              <Globe className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={seo.canonicalUrl || ""}
                onChange={(e) => onChange({ ...seo, canonicalUrl: e.target.value })}
                placeholder={`${STORE_RUNTIME.storefrontUrl}/urunler/ornek-urun`}
                className="w-full pl-11 pr-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
              />
            </div>
          </div>
        </div>

        {/* Right Column - Score & Preview */}
        <div className="space-y-6">
          {/* SEO Score */}
          <div className="bg-gray-50 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-bold text-gray-700">SEO Skoru</span>
              <span className={cn(
                "text-2xl font-black",
                score >= 80 ? "text-emerald-600" : score >= 50 ? "text-amber-500" : "text-rose-600"
              )}>
                {score}
              </span>
            </div>
            <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className={cn(
                  "h-full transition-all",
                  score >= 80 ? "bg-emerald-500" : score >= 50 ? "bg-amber-500" : "bg-rose-500"
                )}
                style={{ width: `${score}%` }}
              />
            </div>

            <div className="mt-4 space-y-2">
              {checks.map((check) => (
                <div key={check.id} className="flex items-center gap-2 text-sm">
                  {check.status === 'success' ? (
                    <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
                  )}
                  <span className={check.status === 'success' ? "text-gray-700" : "text-gray-500"}>
                    {check.message}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Google Preview */}
          <div className="bg-white border border-gray-200 rounded-2xl p-4">
            <h4 className="text-xs font-bold text-gray-400 uppercase mb-3">Google Önizlemesi</h4>
            <div className="space-y-1">
              <a
                href="#"
                className="text-lg text-blue-700 hover:underline line-clamp-2 font-medium"
              >
                {seo.title || productName}
              </a>
              <div className="text-xs text-emerald-700 flex items-center gap-1">
                <span>{storeHost}</span>
                <span className="text-gray-400">›</span>
                <span>urunler</span>
                <span className="text-gray-400">›</span>
                <span className="truncate">{seo.title?.toLowerCase().replace(/\s+/g, '-') || 'urun-adi'}</span>
              </div>
              <p className="text-sm text-gray-600 line-clamp-2">
                {seo.description || productDescription}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
