"use client";

import { type ReactNode, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Layers, Package, Search, Tag } from "lucide-react";

export interface AssignableProduct {
  id: string;
  name: string;
  slug: string;
  category?: string | null;
}

export interface AssignableCategory {
  id: string;
  name: string;
  slug: string;
  parent_id?: string | null;
  sort_order?: number | null;
}

interface SchemaAssignmentManagerProps {
  products: AssignableProduct[];
  categories: AssignableCategory[];
  selectedProductIds: string[];
  selectedCategoryIds: string[];
  onProductAssignmentsChange: (nextIds: string[]) => void;
  onCategoryAssignmentsChange: (nextIds: string[]) => void;
}

function normalizeSearch(value: string) {
  return value.trim().toLocaleLowerCase("tr-TR");
}

function toggleId(current: string[], targetId: string) {
  return current.includes(targetId)
    ? current.filter((id) => id !== targetId)
    : [...current, targetId];
}

export function SchemaAssignmentManager({
  products,
  categories,
  selectedProductIds,
  selectedCategoryIds,
  onProductAssignmentsChange,
  onCategoryAssignmentsChange,
}: SchemaAssignmentManagerProps) {
  const [productQuery, setProductQuery] = useState("");
  const [categoryQuery, setCategoryQuery] = useState("");

  const normalizedProductQuery = normalizeSearch(productQuery);
  const normalizedCategoryQuery = normalizeSearch(categoryQuery);

  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      if (!normalizedProductQuery) return true;
      const haystack = `${product.name} ${product.slug} ${product.category || ""}`.toLocaleLowerCase("tr-TR");
      return haystack.includes(normalizedProductQuery);
    });
  }, [normalizedProductQuery, products]);

  const categoryChildren = useMemo(() => {
    const map = new Map<string | null, AssignableCategory[]>();
    const sorted = [...categories].sort((left, right) => {
      const leftOrder = left.sort_order ?? 0;
      const rightOrder = right.sort_order ?? 0;
      if (leftOrder !== rightOrder) {
        return leftOrder - rightOrder;
      }
      return left.name.localeCompare(right.name, "tr");
    });

    for (const category of sorted) {
      const key = category.parent_id ?? null;
      const bucket = map.get(key) || [];
      bucket.push(category);
      map.set(key, bucket);
    }

    return map;
  }, [categories]);

  const renderCategoryRows = (parentId: string | null = null, depth = 0): ReactNode[] => {
    const items = categoryChildren.get(parentId) || [];
    return items.flatMap((category) => {
      const matchesSearch =
        !normalizedCategoryQuery ||
        `${category.name} ${category.slug}`.toLocaleLowerCase("tr-TR").includes(normalizedCategoryQuery);

      const children = renderCategoryRows(category.id, depth + 1);
      const shouldRenderRow = matchesSearch || children.length > 0 || !normalizedCategoryQuery;

      if (!shouldRenderRow) {
        return [];
      }

      const row = (
        <label
          key={category.id}
          className="flex cursor-pointer items-start gap-3 rounded-[8px] border border-gray-200 bg-white px-4 py-3 transition-colors hover:border-amber-300"
          style={{ marginLeft: depth * 18 }}
        >
          <Checkbox
            checked={selectedCategoryIds.includes(category.id)}
            onCheckedChange={() =>
              onCategoryAssignmentsChange(toggleId(selectedCategoryIds, category.id))
            }
            className="mt-0.5"
          />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-900">{category.name}</span>
              {depth > 0 ? (
                <Badge variant="secondary" className="rounded-full bg-gray-100 text-[10px] font-medium text-gray-600">
                  Alt kategori
                </Badge>
              ) : null}
            </div>
            <p className="truncate text-xs text-gray-500">/{category.slug}</p>
          </div>
        </label>
      );

      return [row, ...children];
    });
  };

  return (
    <div className="mx-auto flex w-full max-w-none flex-col gap-6 p-6">
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-gray-900">
                <Package className="h-4 w-4" />
                <h2 className="text-lg font-semibold">Ürüne Ata</h2>
              </div>
              <p className="mt-1 text-sm text-gray-500">
                Seçilen ürünlerin detay sayfasında bu ekstra niteliklerden sonra görünür.
              </p>
            </div>
            <Badge className="rounded-full bg-amber-100 px-3 py-1 text-amber-900 hover:bg-amber-100">
              {selectedProductIds.length} ürün
            </Badge>
          </div>

          <div className="relative mb-4">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              value={productQuery}
              onChange={(event) => setProductQuery(event.target.value)}
              placeholder="Ürün adı veya slug ara..."
              className="pl-9"
            />
          </div>

          <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
            {filteredProducts.map((product) => (
              <label
                key={product.id}
                className="flex cursor-pointer items-start gap-3 rounded-[8px] border border-gray-200 bg-white px-4 py-3 transition-colors hover:border-amber-300"
              >
                <Checkbox
                  checked={selectedProductIds.includes(product.id)}
                  onCheckedChange={() =>
                    onProductAssignmentsChange(toggleId(selectedProductIds, product.id))
                  }
                  className="mt-0.5"
                />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-gray-900">{product.name}</p>
                  <p className="truncate text-xs text-gray-500">/{product.slug}</p>
                  {product.category ? (
                    <p className="truncate text-[11px] uppercase tracking-wide text-gray-400">
                      {product.category}
                    </p>
                  ) : null}
                </div>
              </label>
            ))}

            {filteredProducts.length === 0 ? (
              <div className="rounded-[8px] border border-dashed border-gray-200 px-4 py-8 text-center text-sm text-gray-500">
                Aramaya uyan ürün bulunamadı.
              </div>
            ) : null}
          </div>
        </div>

        <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-gray-900">
                <Layers className="h-4 w-4" />
                <h2 className="text-lg font-semibold">Kategoriye Ata</h2>
              </div>
              <p className="mt-1 text-sm text-gray-500">
                Seçilen kategori veya alt kategoriye bağlı ürünlerde otomatik görünür.
              </p>
            </div>
            <Badge className="rounded-full bg-blue-100 px-3 py-1 text-blue-900 hover:bg-blue-100">
              {selectedCategoryIds.length} kategori
            </Badge>
          </div>

          <div className="relative mb-4">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              value={categoryQuery}
              onChange={(event) => setCategoryQuery(event.target.value)}
              placeholder="Kategori adı veya slug ara..."
              className="pl-9"
            />
          </div>

          <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
            {renderCategoryRows()}
            {categories.length === 0 ? (
              <div className="rounded-[8px] border border-dashed border-gray-200 px-4 py-8 text-center text-sm text-gray-500">
                Henüz kategori bulunmuyor.
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-dashed border-gray-200 bg-white px-6 py-4">
        <div className="flex items-start gap-3 text-sm text-gray-600">
          <Tag className="mt-0.5 h-4 w-4 flex-shrink-0 text-gray-400" />
          <p>
            Ürüne özel atama, kategori atamasından daha öncelikli çalışır. Bir üründe hem direkt atama
            hem kategori ataması varsa storefront önce ürüne atanmış ekstra şemasını gösterir.
          </p>
        </div>
      </div>
    </div>
  );
}
