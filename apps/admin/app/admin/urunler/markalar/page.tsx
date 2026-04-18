import Link from "next/link";
import { Layers3, Package2, Tag } from "lucide-react";

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

export default async function BrandsManagementPage() {
  try {
    const { brands, brandedProductCount } = await withServerTimeout(
      getBrandSummaries(),
      7000,
      "Marka verileri zaman asimina ugradi.",
    );

    return (
      <div className="space-y-6">
        <section className="overflow-hidden rounded-[30px] border border-[#FE6100]/10 bg-gradient-to-br from-white via-[#fffdfa] to-[#faf4ed] shadow-[0_24px_80px_rgba(254,97,0,0.12)]">
          <div className="border-b border-[#FE6100]/8 px-5 py-5 md:px-8 md:py-7">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-3">
                <div className="inline-flex w-fit items-center rounded-full border border-[#FE6100]/20 bg-gradient-to-r from-[#FE6100]/10 to-[#FF8B3D]/5 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.24em] text-[#FE6100]">
                  Marka Yönetimi
                </div>
                <div>
                  <h1 className="text-2xl font-semibold tracking-[-0.03em] text-[#2f241d] md:text-3xl">
                    Ürünlerde kullanılan markaları tek yerde izle
                  </h1>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-[#7b685b] md:text-[15px]">
                    Ürün kartlarından ve toplu yükleme sonrası gelen marka alanları burada otomatik görünür.
                    Ayrı bir tablo yönetimi yerine mevcut ürün verisi baz alınır.
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/admin/urunler/toplu-yukle"
                  className="inline-flex items-center justify-center rounded-2xl border border-[#FE6100]/15 bg-white px-4 py-3 text-sm font-semibold text-[#8a4b22] shadow-sm transition hover:border-[#FE6100]/30 hover:bg-[#fff7f1] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FE6100]/20"
                >
                  Toplu Yükle
                </Link>
                <Link
                  href="/admin/urunler"
                  className="inline-flex items-center justify-center rounded-2xl bg-gradient-to-r from-[#FE6100] to-[#E45700] px-5 py-3 text-sm font-semibold text-white shadow-[0_18px_35px_rgba(254,97,0,0.24)] transition hover:translate-y-[-1px] hover:from-[#f05c00] hover:to-[#d84f00] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FE6100]/20"
                >
                  Ürün Yönetimine Dön
                </Link>
              </div>
            </div>
          </div>

          <div className="grid gap-px bg-gradient-to-r from-[#FE6100]/10 via-[#FF8B3D]/5 to-[#FE6100]/10 md:grid-cols-3">
            {[
              { label: "Toplam Marka", value: String(brands.length), icon: Tag },
              { label: "Markalı Ürün", value: String(brandedProductCount), icon: Package2 },
              { label: "Kategori Kapsamı", value: String(new Set(brands.flatMap((brand) => brand.categories)).size), icon: Layers3 },
            ].map((item) => (
              <div key={item.label} className="border border-white/70 bg-white/70 px-5 py-5 backdrop-blur-sm md:px-6">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#fff3e9] text-[#FE6100] shadow-sm">
                    <item.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#9d816d]">{item.label}</p>
                    <p className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-[#2f241d]">{item.value}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-[30px] border border-[#ecdccd] bg-gradient-to-br from-white/95 via-[#fffdfa] to-[#f6eee6] p-5 shadow-[0_24px_55px_rgba(98,64,33,0.09)] md:p-6">
          {brands.length === 0 ? (
            <div className="rounded-[24px] border border-[#eadccd] bg-white/90 px-5 py-8 text-center shadow-sm">
              <p className="text-lg font-semibold text-[#2f241d]">Henüz marka bulunmuyor</p>
              <p className="mt-2 text-sm text-[#7b685b]">
                Ürünlerde veya toplu yükleme sonrası gelen marka alanları doldukça burada listelenecek.
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-[28px] border border-[#eadccd] bg-white/90 shadow-sm">
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-[#f9f3ed] text-[#6c584b]">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold">Marka</th>
                      <th className="px-4 py-3 text-left font-semibold">Ürün Sayısı</th>
                      <th className="px-4 py-3 text-left font-semibold">Kategoriler</th>
                      <th className="px-4 py-3 text-left font-semibold">Son Görülen Ürünler</th>
                      <th className="px-4 py-3 text-left font-semibold">Son Güncelleme</th>
                    </tr>
                  </thead>
                  <tbody>
                    {brands.map((brand) => (
                      <tr key={brand.key} className="border-t border-[#f2e7dc] align-top">
                        <td className="px-4 py-4">
                          <div className="font-semibold text-[#2f241d]">{brand.label}</div>
                        </td>
                        <td className="px-4 py-4 text-[#6c584b]">{brand.productCount}</td>
                        <td className="px-4 py-4">
                          <div className="flex flex-wrap gap-2">
                            {brand.categories.length > 0 ? (
                              brand.categories.slice(0, 4).map((category) => (
                                <span
                                  key={`${brand.key}-${category}`}
                                  className="rounded-full border border-[#ead9cb] bg-[#fff7f1] px-2.5 py-1 text-xs font-medium text-[#8a4b22]"
                                >
                                  {category}
                                </span>
                              ))
                            ) : (
                              <span className="text-[#8d796a]">Kategori yok</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <div className="space-y-1">
                            {brand.recentProducts.map((product) => (
                              <Link
                                key={`${brand.key}-${product.id}`}
                                href={`/admin/urunler/${product.id}/duzenle`}
                                className="block font-medium text-[#8a4b22] transition hover:text-[#FE6100]"
                              >
                                {product.name}
                              </Link>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-4 text-[#6c584b]">{formatDate(brand.lastProductAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      </div>
    );
  } catch (error) {
    console.error("Admin brands page bootstrap error:", error);

    return (
      <div className="rounded-[28px] border border-red-200/70 bg-gradient-to-br from-red-50 to-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-red-900">Marka verileri alınamadı</h1>
        <p className="mt-2 text-sm leading-6 text-red-800">
          Marka Yönetimi sayfası ilk açılışta ürün verilerini çekemedi. Sayfayı yenileyip tekrar deneyin.
        </p>
      </div>
    );
  }
}
