import Link from "next/link";
import { ArrowUpRight, CalendarDays, Layers3, Package2, Tag, Upload } from "lucide-react";

import { AdminPageHeader } from "@/components/admin/AdminPageShell";
import { createServerClient } from "@/lib/supabase";
import { withServerTimeout } from "@/lib/server-timeout";

type BrandProductRow = {
  id: string;
  name: string;
  slug: string;
  brand: string | null;
  category: string | null;
  created_at?: string | null;
};

type BrandSummary = {
  key: string;
  label: string;
  productCount: number;
  categories: string[];
  recentProducts: Array<{ id: string; name: string }>;
  lastProductAt: string | null;
};

function normalizeBrandKey(value: string) {
  return value.trim().toLocaleLowerCase("tr");
}

async function getBrandSummaries(): Promise<{
  brands: BrandSummary[];
  brandedProductCount: number;
}> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("products")
    .select("id,name,slug,brand,category,created_at")
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  const rows = ((data || []) as BrandProductRow[]).filter(
    (row) => typeof row.brand === "string" && row.brand.trim().length > 0,
  );

  const brandMap = new Map<string, BrandSummary>();

  rows.forEach((row) => {
    const label = row.brand!.trim();
    const key = normalizeBrandKey(label);
    const existing = brandMap.get(key);

    if (!existing) {
      brandMap.set(key, {
        key,
        label,
        productCount: 1,
        categories: row.category ? [row.category] : [],
        recentProducts: [{ id: row.id, name: row.name }],
        lastProductAt: row.created_at || null,
      });
      return;
    }

    existing.productCount += 1;

    if (row.category && !existing.categories.includes(row.category)) {
      existing.categories.push(row.category);
    }

    if (existing.recentProducts.length < 3) {
      existing.recentProducts.push({ id: row.id, name: row.name });
    }

    if (!existing.lastProductAt && row.created_at) {
      existing.lastProductAt = row.created_at;
    }
  });

  const brands = Array.from(brandMap.values()).sort((left, right) => {
    if (right.productCount !== left.productCount) {
      return right.productCount - left.productCount;
    }

    return left.label.localeCompare(right.label, "tr");
  });

  return {
    brands,
    brandedProductCount: rows.length,
  };
}

function formatDate(value: string | null) {
  if (!value) {
    return "Tarih yok";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Tarih yok";
  }

  return date.toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function getBrandInitials(label: string) {
  return label
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase("tr-TR") || "")
    .join("");
}

export default async function BrandsManagementPage() {
  try {
    const { brands, brandedProductCount } = await withServerTimeout(
      getBrandSummaries(),
      7000,
      "Marka verileri zaman asimina ugradi.",
    );
    const categoryCoverage = new Set(brands.flatMap((brand) => brand.categories)).size;
    const largestBrand = brands[0] ?? null;
    const brandsWithoutCategory = brands.filter((brand) => brand.categories.length === 0).length;

    return (
      <div className="min-h-screen bg-[#F9F9F9] pb-8 text-[var(--admin-heading)]">
        <div className="mx-auto w-full max-w-none space-y-4 px-4 sm:px-5 xl:px-6">
          <AdminPageHeader
            sectionLabel="Katalog"
            title="Markalar"
            description="Ürün kayıtlarındaki marka alanlarını izleyin."
            actions={
              <Link
                href="/admin/urunler/toplu-yukle"
                className="inline-flex h-10 items-center justify-center gap-2 rounded-[8px] border border-[var(--admin-accent-border)] bg-white px-4 text-sm font-semibold text-[var(--admin-accent-hover)] transition hover:bg-[var(--admin-accent-soft)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(255,106,0,0.18)]"
              >
                <Upload className="h-4 w-4" />
                Toplu Yükle
              </Link>
            }
            metrics={
              <>
                {[
                  { label: "Toplam", value: brands.length, detail: "marka", icon: Tag },
                  { label: "Markalı ürün", value: brandedProductCount, detail: "ürün", icon: Package2 },
                  { label: "Kategori", value: categoryCoverage, detail: "kapsam", icon: Layers3 },
                ].map((metric) => {
                  const Icon = metric.icon;

                  return (
                    <div key={metric.label} className="min-h-[92px] bg-white px-4 py-3.5 xl:px-5">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#6B7280]">
                          {metric.label}
                        </p>
                        <Icon className="h-4 w-4 text-[#9CA3AF]" />
                      </div>
                      <div className="mt-3 flex items-end gap-2">
                        <p className="text-3xl font-semibold tracking-[-0.04em] text-[#111827]">{metric.value}</p>
                        <span className="pb-1 text-sm font-medium text-[#6B7280]">{metric.detail}</span>
                      </div>
                    </div>
                  );
                })}
              </>
            }
          />

          <section className="grid gap-3 border-b border-[#E1E7EF] bg-[#F9F9F9] pb-4 min-[1180px]:grid-cols-[minmax(0,1fr)_auto] min-[1180px]:items-center">
            <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[#6B7280]">
              <span className="inline-flex h-10 items-center rounded-[10px] border border-[#DCE3EC] bg-white px-3">
                En yoğun: {largestBrand ? `${largestBrand.label} (${largestBrand.productCount})` : "Yok"}
              </span>
              <span className="inline-flex h-10 items-center rounded-[10px] border border-[#DCE3EC] bg-white px-3">
                Kategorisiz: {brandsWithoutCategory}
              </span>
              <span className="inline-flex h-10 items-center rounded-[10px] border border-[#DCE3EC] bg-white px-3">
                Kaynak: ürün verisi
              </span>
            </div>
            <Link
              href="/admin/urunler"
              className="inline-flex h-10 w-fit items-center justify-center gap-2 rounded-[10px] bg-[#FFF1E8] px-3 text-sm font-semibold text-[var(--admin-accent-hover)] transition hover:bg-[#FFE7D6] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(255,106,0,0.18)]"
            >
              Ürünlere git
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          </section>

          {brands.length === 0 ? (
            <section className="rounded-[12px] border border-[#DCE3EC] bg-white px-6 py-16 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[16px] bg-[#FFF1E8] text-[var(--admin-accent)]">
                <Tag className="h-8 w-8" />
              </div>
              <h2 className="mt-5 text-2xl font-semibold tracking-[-0.03em] text-[#111827]">Henüz marka bulunmuyor</h2>
              <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-[#6B7280]">
                Ürünlerde marka alanı doldukça liste burada otomatik oluşacak.
              </p>
            </section>
          ) : (
            <section className="overflow-hidden rounded-[12px] border border-[#DCE3EC] bg-white shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-[#DCE3EC] bg-[#EEF3F7] px-5 py-3">
                <div>
                  <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-[#4B5563]">Marka listesi</h2>
                  <p className="mt-1 text-xs font-medium text-[#6B7280]">
                    Ürün sayısı, kategori kapsamı ve son ürünler aynı tabloda.
                  </p>
                </div>
                <span className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-[#6B7280]">
                  {brands.length} marka
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-[980px] w-full text-left text-sm">
                  <thead className="bg-[#F7FAFC] text-[#4B5563]">
                    <tr>
                      <th className="w-[28%] px-5 py-3 font-semibold">Marka</th>
                      <th className="w-[14%] px-5 py-3 font-semibold">Ürün</th>
                      <th className="w-[24%] px-5 py-3 font-semibold">Kategoriler</th>
                      <th className="w-[24%] px-5 py-3 font-semibold">Son ürünler</th>
                      <th className="w-[10%] px-5 py-3 font-semibold">Güncelleme</th>
                    </tr>
                  </thead>
                  <tbody>
                    {brands.map((brand) => (
                      <tr key={brand.key} className="border-t border-[#E7EAF0] align-top transition hover:bg-[#FFF8F3]">
                        <td className="px-5 py-4">
                          <div className="flex min-w-0 items-center gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-[#111827] text-xs font-bold text-white">
                              {getBrandInitials(brand.label) || "M"}
                            </div>
                            <div className="min-w-0">
                              <div className="truncate text-base font-semibold tracking-[-0.02em] text-[#111827]">
                                {brand.label}
                              </div>
                              <div className="mt-1 text-xs font-medium text-[#9CA3AF]">
                                {brand.key}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <div className="text-xl font-semibold tracking-[-0.03em] text-[#111827]">{brand.productCount}</div>
                          <div className="mt-1 text-xs font-medium text-[#6B7280]">ürün</div>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex flex-wrap gap-2">
                            {brand.categories.length > 0 ? (
                              brand.categories.slice(0, 4).map((category) => (
                                <span
                                  key={`${brand.key}-${category}`}
                                  className="rounded-full bg-[#FFF1E8] px-2.5 py-1 text-xs font-semibold text-[var(--admin-accent-hover)]"
                                >
                                  {category}
                                </span>
                              ))
                            ) : (
                              <span className="text-sm font-medium text-[#9CA3AF]">Kategori yok</span>
                            )}
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <div className="space-y-1.5">
                            {brand.recentProducts.map((product) => (
                              <Link
                                key={`${brand.key}-${product.id}`}
                                href={`/admin/urunler/${product.id}/duzenle`}
                                className="block max-w-[260px] truncate font-semibold text-[#374151] transition hover:text-[var(--admin-accent-hover)]"
                              >
                                {product.name}
                              </Link>
                            ))}
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <div className="inline-flex items-center gap-2 text-sm font-medium text-[#6B7280]">
                            <CalendarDays className="h-4 w-4 text-[#9CA3AF]" />
                            {formatDate(brand.lastProductAt)}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      </div>
    );
  } catch (error) {
    console.error("Admin brands page bootstrap error:", error);

    return (
      <div className="rounded-[12px] border border-red-200/70 bg-gradient-to-br from-red-50 to-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-red-900">Marka verileri alınamadı</h1>
        <p className="mt-2 text-sm leading-6 text-red-800">
          Marka Yönetimi sayfası ilk açılışta ürün verilerini çekemedi. Sayfayı yenileyip tekrar deneyin.
        </p>
      </div>
    );
  }
}
