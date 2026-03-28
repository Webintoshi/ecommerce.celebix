"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Plus,
  ChevronLeft,
  Palette,
  Ruler,
  Weight,
  Box,
  MoreVertical,
  Pencil,
  Trash2,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { VariantAttribute } from "@/types/variant-attributes";

const ICON_MAP: Record<string, React.ElementType> = {
  renk: Palette,
  beden: Ruler,
  gramaj: Weight,
  default: Box,
};

export default function VariantAttributesPage() {
  const router = useRouter();
  const [attributes, setAttributes] = useState<VariantAttribute[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteLoading, setDeleteLoading] = useState<string | null>(null);
  const [expandedAttribute, setExpandedAttribute] = useState<string | null>(null);

  useEffect(() => {
    fetchAttributes();
  }, []);

  const fetchAttributes = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/admin/variant-attributes?withValues=true");
      const data = await response.json();

      if (data.success) {
        setAttributes(data.attributes);
      } else {
        toast.error(data.error || "Nitelikler yüklenirken hata oluştu");
      }
    } catch (error) {
      toast.error("Nitelikler yüklenirken hata oluştu");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Bu niteliği silmek istediğinize emin misiniz? Bu işlem geri alınamaz.")) {
      return;
    }

    try {
      setDeleteLoading(id);
      const response = await fetch(`/api/admin/variant-attributes?id=${id}`, {
        method: "DELETE",
      });
      const data = await response.json();

      if (data.success) {
        toast.success("Nitelik başarıyla silindi");
        setAttributes((prev) => prev.filter((attr) => attr.id !== id));
      } else {
        toast.error(data.error || "Silme işlemi başarısız");
      }
    } catch (error) {
      toast.error("Silme işlemi sırasında hata oluştu");
    } finally {
      setDeleteLoading(null);
    }
  };

  const getIcon = (slug: string) => {
    return ICON_MAP[slug] || ICON_MAP.default;
  };

  const toggleExpand = (id: string) => {
    setExpandedAttribute(expandedAttribute === id ? null : id);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/admin/urunler"
            className="p-2 hover:bg-gray-200 rounded-xl transition-colors"
          >
            <ChevronLeft className="w-5 h-5 text-gray-600" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Nitelikler</h1>
            <p className="text-sm text-gray-500">
              Ürün varyantları için nitelik grupları ve değerleri yönetin
            </p>
          </div>
        </div>
        <Link
          href="/admin/urunler/nitelikler/yeni"
          className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Yeni Nitelik
        </Link>
      </div>

      {/* Info Card */}
      <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
        <div className="text-sm text-blue-800">
          <p className="font-medium mb-1">Nitelikler Nedir?</p>
          <p className="text-blue-700">
            Nitelikler, ürün varyantlarınızı tanımlamak için kullanılan özelliklerdir. 
            Örneğin: Renk (Kırmızı, Mavi), Beden (S, M, L), Gramaj (250g, 450g) gibi. 
            Ürün eklerken bu nitelikleri seçip istediğiniz kombinasyonları kendiniz oluşturabilirsiniz.
          </p>
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      )}

      {/* Empty State */}
      {!loading && attributes.length === 0 && (
        <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Box className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            Henüz nitelik eklenmemiş
          </h3>
          <p className="text-gray-500 mb-6 max-w-md mx-auto">
            Ürün varyantları için nitelik grupları oluşturun. 
            Örneğin: Renk, Beden, Gramaj, Malzeme vb.
          </p>
          <Link
            href="/admin/urunler/nitelikler/yeni"
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl font-medium hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            İlk Niteliği Ekle
          </Link>
        </div>
      )}

      {/* Attributes Grid */}
      {!loading && attributes.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {attributes.map((attribute) => {
            const Icon = getIcon(attribute.slug);
            const isExpanded = expandedAttribute === attribute.id;
            const values = attribute.values || [];

            return (
              <div
                key={attribute.id}
                className={cn(
                  "bg-white border rounded-2xl overflow-hidden transition-all",
                  isExpanded ? "border-primary ring-1 ring-primary/20" : "border-gray-200"
                )}
              >
                {/* Card Header */}
                <div className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
                        <Icon className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900">
                          {attribute.name}
                        </h3>
                        <p className="text-xs text-gray-500">
                          {values.length} değer
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => router.push(`/admin/urunler/nitelikler/${attribute.id}/duzenle`)}
                        className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                        title="Düzenle"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(attribute.id)}
                        disabled={deleteLoading === attribute.id}
                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                        title="Sil"
                      >
                        {deleteLoading === attribute.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Values Preview */}
                <div className="px-4 pb-4">
                  <div className="flex flex-wrap gap-2">
                    {values.slice(0, 6).map((value) => (
                      <span
                        key={value.id}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-gray-100 rounded-lg text-sm text-gray-700"
                      >
                        {value.image_url ? (
                          <img 
                            src={value.image_url} 
                            alt={value.value}
                            className="w-5 h-5 rounded object-cover border border-gray-200"
                          />
                        ) : value.color_code ? (
                          <span
                            className="w-3 h-3 rounded-full border border-gray-200"
                            style={{ backgroundColor: value.color_code }}
                          />
                        ) : null}
                        {value.value}
                      </span>
                    ))}
                    {values.length > 6 && (
                      <button
                        onClick={() => toggleExpand(attribute.id)}
                        className="px-2.5 py-1 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm text-gray-600 transition-colors"
                      >
                        +{values.length - 6} daha
                      </button>
                    )}
                  </div>

                  {/* Expanded Values */}
                  {isExpanded && values.length > 6 && (
                    <div className="mt-3 pt-3 border-t border-gray-100 flex flex-wrap gap-2">
                      {values.slice(6).map((value) => (
                        <span
                          key={value.id}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-gray-100 rounded-lg text-sm text-gray-700"
                        >
                          {value.image_url ? (
                            <img 
                              src={value.image_url} 
                              alt={value.value}
                              className="w-5 h-5 rounded object-cover border border-gray-200"
                            />
                          ) : value.color_code ? (
                            <span
                              className="w-3 h-3 rounded-full border border-gray-200"
                              style={{ backgroundColor: value.color_code }}
                            />
                          ) : null}
                          {value.value}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
