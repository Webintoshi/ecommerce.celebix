"use client";

import { useState } from "react";
import { Upload, CheckCircle, XCircle, AlertCircle, Loader2, Image as ImageIcon } from "lucide-react";
import Link from "next/link";
import { Product } from "@/types/product";
import { addStoredProducts } from "@/lib/product-storage";
import { parseShopifyCSV } from "@/lib/csv-import";
import { buildStorefrontProductUrl } from "@/lib/store-runtime";

interface ImportResult {
  success: boolean;
  productCount: number;
  variantCount: number;
  imageCount: number;
  errors: string[];
  products: Product[];
}

export default function AutoImportPage() {
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const handleAutoImport = async () => {
    setImporting(true);
    setResult(null);

    try {
      const response = await fetch('/products_export_1.csv');
      
      if (!response.ok) {
        throw new Error('CSV dosyası bulunamadı: /public/products_export_1.csv');
      }

      const csvContent = await response.text();
      
      if (!csvContent.trim()) {
        setResult({
          success: false,
          productCount: 0,
          variantCount: 0,
          imageCount: 0,
          errors: ["CSV dosyası boş!"],
          products: []
        });
        setImporting(false);
        return;
      }

      const products = parseShopifyCSV(csvContent);

      if (products.length === 0) {
        setResult({
          success: false,
          productCount: 0,
          variantCount: 0,
          imageCount: 0,
          errors: ["CSV'den hiçbir ürün parse edilemedi. Dosya formatını kontrol edin."],
          products: []
        });
        setImporting(false);
        return;
      }

      addStoredProducts(products);

      const totalVariants = products.reduce((sum, p) => sum + p.variants.length, 0);
      const totalImages = products.reduce((sum, p) => sum + p.images.length, 0);

      setResult({
        success: true,
        productCount: products.length,
        variantCount: totalVariants,
        imageCount: totalImages,
        errors: [],
        products
      });
    } catch (error) {
      setResult({
        success: false,
        productCount: 0,
        variantCount: 0,
        imageCount: 0,
        errors: [`Hata: ${error instanceof Error ? error.message : "Bilinmeyen hata"}`],
        products: []
      });
    }

    setImporting(false);
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-[#faf8f5] via-[#f5efe8] to-[#efe5dc]">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-20 right-[-8rem] h-[22rem] w-[22rem] rounded-full bg-[#FE6100]/10 blur-3xl" />
        <div className="absolute left-[-6rem] top-[30%] h-[18rem] w-[18rem] rounded-full bg-amber-200/30 blur-3xl" />
        <div className="absolute bottom-[-6rem] right-[18%] h-[18rem] w-[18rem] rounded-full bg-orange-100/40 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-5xl px-4 py-6 md:px-6 md:py-8 lg:px-8">
        <div className="space-y-6">
          <section className="overflow-hidden rounded-[30px] border border-[#FE6100]/10 bg-gradient-to-br from-white via-[#fffdfa] to-[#faf4ed] shadow-[0_24px_80px_rgba(254,97,0,0.12)]">
            <div className="border-b border-[#FE6100]/8 px-5 py-5 md:px-8 md:py-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-3">
                  <div className="inline-flex w-fit items-center rounded-full border border-[#FE6100]/20 bg-gradient-to-r from-[#FE6100]/10 to-[#FF8B3D]/5 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.24em] text-[#FE6100]">
                    Otomatik yukleme
                  </div>
                  <h1 className="sr-only">Shopify Ürün İçe Aktarma</h1>
                  <p className="max-w-2xl text-sm leading-6 text-[#786658]">
                    `products_export_1.csv` kaynagini tek dokunusta tarayin, parse edin ve sonuclari panel akisi icinde gozden gecirin.
                  </p>
                </div>
                <Link
                  href="/admin/urunler"
                  className="inline-flex items-center justify-center rounded-2xl border border-[#FE6100]/15 bg-white px-4 py-3 text-sm font-semibold text-[#8a4b22] shadow-sm transition hover:border-[#FE6100]/30 hover:bg-[#fff7f1] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FE6100]/20"
                >
                  Geri Don
                </Link>
              </div>
            </div>
          </section>

        {!result && (
          <section className="rounded-[30px] border border-[#ecdccd] bg-gradient-to-br from-white/95 via-[#fffdfa] to-[#f6eee6] p-6 shadow-[0_24px_55px_rgba(98,64,33,0.09)] md:p-8">
            <div className="text-center">
              <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-[28px] bg-gradient-to-br from-[#fff0e3] to-[#f6deca] shadow-[0_18px_35px_rgba(254,97,0,0.12)]">
                <Upload className="h-10 w-10 text-[#FE6100]" />
              </div>

              <h3 className="mb-2 text-xl font-semibold text-[#2f241d]">
                Ürünleri İçe Aktar
              </h3>

              <button
                onClick={handleAutoImport}
                disabled={importing}
                className="inline-flex items-center gap-3 rounded-2xl bg-gradient-to-r from-[#FE6100] to-[#E45700] px-8 py-4 text-sm font-semibold text-white shadow-[0_18px_35px_rgba(254,97,0,0.24)] transition hover:translate-y-[-1px] hover:from-[#f05c00] hover:to-[#d84f00] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FE6100]/20 disabled:pointer-events-none disabled:opacity-60"
              >
                {importing ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    İçe Aktarılıyor...
                  </>
                ) : (
                  <>
                    <Upload className="w-5 h-5" />
                    İçe Aktarmayı Başlat
                  </>
                )}
              </button>

              <p className="mt-4 text-xs text-[#8b6d58]">
                Kaynak: /public/products_export_1.csv
              </p>
            </div>
          </section>
        )}

        {result && (
          <section className="rounded-[30px] border border-[#ecdccd] bg-gradient-to-br from-white/95 via-[#fffdfa] to-[#f6eee6] p-5 shadow-[0_24px_55px_rgba(98,64,33,0.09)] md:p-6">
            <h3 className="mb-4 text-lg font-semibold text-[#2f241d]">
              {result.success ? "İçe Aktarma Tamamlandı!" : "İçe Aktarma Başarısız"}
            </h3>

            {result.success ? (
              <>
                <div className="grid md:grid-cols-3 gap-4 mb-6">
                  <div className="flex items-center gap-3 rounded-[24px] border border-emerald-200/70 bg-gradient-to-br from-emerald-50 to-white p-4 shadow-sm">
                    <CheckCircle className="w-8 h-8 text-green-600" />
                    <div>
                      <p className="text-2xl font-bold text-green-900">
                        {result.productCount}
                      </p>
                      <p className="text-sm text-green-700">Ürün Yüklendi</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 rounded-[24px] border border-sky-200/70 bg-gradient-to-br from-sky-50 to-white p-4 shadow-sm">
                    <CheckCircle className="w-8 h-8 text-blue-600" />
                    <div>
                      <p className="text-2xl font-bold text-blue-900">
                        {result.variantCount}
                      </p>
                      <p className="text-sm text-blue-700">Varyant</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 rounded-[24px] border border-amber-200/70 bg-gradient-to-br from-amber-50 to-white p-4 shadow-sm">
                    <ImageIcon className="w-8 h-8 text-amber-600" />
                    <div>
                      <p className="text-2xl font-bold text-amber-900">
                        {result.imageCount}
                      </p>
                      <p className="text-sm text-amber-700">Görsel</p>
                    </div>
                  </div>
                </div>

                <div className="border-t border-[#efdfd1] pt-6">
                  <h4 className="mb-3 font-medium text-[#2f241d]">Yüklenen Ürünler:</h4>
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {result.products.map((product) => (
                      <div key={product.id} className="flex flex-col gap-4 rounded-[24px] border border-[#ecdccd] bg-white/90 p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-3">
                          {product.images[0] && (
                            <img 
                              src={product.images[0]} 
                              alt={product.name}
                              className="h-12 w-12 rounded-2xl object-cover"
                              onError={(e) => {
                                (e.target as HTMLImageElement).src = '/images/placeholder.jpg';
                              }}
                            />
                          )}
                          <div>
                            <p className="font-medium text-[#2f241d]">{product.name}</p>
                            <p className="text-sm text-[#786658]">
                              {product.category} • {product.variants.length} varyant • {product.images.length} görsel
                            </p>
                            <p className="text-xs text-[#8b6d58]">
                              {product.variants[0]?.price}₺
                            </p>
                          </div>
                        </div>
                        <Link
                          href={buildStorefrontProductUrl(product.slug)}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sm font-medium text-[#C94E00] transition hover:text-[#a54100] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FE6100]/15"
                        >
                          Görüntüle
                        </Link>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="mb-6">
                {result.errors.map((error, index) => (
                  <div
                    key={index}
                    className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 p-3"
                  >
                    <XCircle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-red-800">{error}</p>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <button
                onClick={() => setResult(null)}
                className="flex-1 rounded-2xl bg-gradient-to-r from-[#FE6100] to-[#E45700] px-4 py-3 text-sm font-semibold text-white shadow-[0_18px_35px_rgba(254,97,0,0.24)] transition hover:from-[#f05c00] hover:to-[#d84f00] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FE6100]/20"
              >
                Tekrar Dene
              </button>
              <Link
                href="/admin/urunler"
                className="flex-1 rounded-2xl border border-[#FE6100]/15 bg-white px-4 py-3 text-center text-sm font-semibold text-[#8a4b22] shadow-sm transition hover:border-[#FE6100]/30 hover:bg-[#fff7f1] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FE6100]/20"
              >
                Ürün Listesine Git
              </Link>
            </div>
          </section>
        )}
        </div>
      </div>
    </main>
  );
}
