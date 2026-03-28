"use client";

import { useState } from "react";
import { Upload, CheckCircle, XCircle, AlertCircle, Loader2, Image as ImageIcon } from "lucide-react";
import Link from "next/link";
import { Product } from "@/types/product";
import { addStoredProducts } from "@/lib/product-storage";
import { parseShopifyCSV } from "@/lib/csv-import";

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
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Shopify Ürün İçe Aktarma
          </h1>
          <p className="text-gray-600">
            products_export_1.csv dosyasından tüm ürünleri içe aktar
          </p>
        </div>
        <Link
          href="/admin/urunler"
          className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          Geri Dön
        </Link>
      </div>

      <div className="max-w-4xl mx-auto">
        <div className="bg-gradient-to-br from-primary/10 to-secondary/20 border border-primary/20 rounded-xl p-6 mb-8">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center flex-shrink-0">
              <AlertCircle className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 mb-2">
                Bu sayfa ne yapar?
              </h3>
              <p className="text-sm text-gray-700 mb-3">
                <code className="px-2 py-1 bg-white rounded text-primary">/public/products_export_1.csv</code> dosyasindaki Shopify urunlerini otomatik olarak Celebix Panel formatina donusturur ve sisteme yukler.
              </p>
              <ul className="text-sm text-gray-700 space-y-1 list-disc list-inside">
                <li>Shopify CSV formatını otomatik tanır</li>
                <li>Her ürün için 5 adede kadar görsel alır (Shopify CDN'den)</li>
                <li>Ürün açıklamalarını HTML'den temizler</li>
                <li>Kategorileri otomatik belirler (fıstık ezmesi, fındık ezmesi, kuruyemiş)</li>
                <li>Diyet özelliklerini etiketlerden çıkarır (vegan, glutensiz, vb.)</li>
                <li>Mevcut ürünler güncellenir, yeniler eklenir</li>
              </ul>
            </div>
          </div>
        </div>

        {!result && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
            <div className="text-center">
              <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
                <Upload className="w-10 h-10 text-primary" />
              </div>

              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                Ürünleri İçe Aktar
              </h3>
              <p className="text-gray-600 mb-6">
                Tek tıkla Shopify ürünlerini sisteme aktarın
              </p>

              <button
                onClick={handleAutoImport}
                disabled={importing}
                className="px-8 py-4 bg-primary text-white rounded-lg font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-3"
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

              <p className="text-xs text-gray-500 mt-4">
                Kaynak: /public/products_export_1.csv
              </p>
            </div>
          </div>
        )}

        {result && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              {result.success ? "İçe Aktarma Tamamlandı!" : "İçe Aktarma Başarısız"}
            </h3>

            {result.success ? (
              <>
                <div className="grid md:grid-cols-3 gap-4 mb-6">
                  <div className="flex items-center gap-3 p-4 bg-green-50 rounded-lg">
                    <CheckCircle className="w-8 h-8 text-green-600" />
                    <div>
                      <p className="text-2xl font-bold text-green-900">
                        {result.productCount}
                      </p>
                      <p className="text-sm text-green-700">Ürün Yüklendi</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 p-4 bg-blue-50 rounded-lg">
                    <CheckCircle className="w-8 h-8 text-blue-600" />
                    <div>
                      <p className="text-2xl font-bold text-blue-900">
                        {result.variantCount}
                      </p>
                      <p className="text-sm text-blue-700">Varyant</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 p-4 bg-purple-50 rounded-lg">
                    <ImageIcon className="w-8 h-8 text-purple-600" />
                    <div>
                      <p className="text-2xl font-bold text-purple-900">
                        {result.imageCount}
                      </p>
                      <p className="text-sm text-purple-700">Görsel</p>
                    </div>
                  </div>
                </div>

                <div className="pt-6 border-t border-gray-200">
                  <h4 className="font-medium text-gray-900 mb-3">Yüklenen Ürünler:</h4>
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {result.products.map((product) => (
                      <div key={product.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div className="flex items-center gap-3">
                          {product.images[0] && (
                            <img 
                              src={product.images[0]} 
                              alt={product.name}
                              className="w-12 h-12 object-cover rounded"
                              onError={(e) => {
                                (e.target as HTMLImageElement).src = '/images/placeholder.jpg';
                              }}
                            />
                          )}
                          <div>
                            <p className="font-medium text-gray-900">{product.name}</p>
                            <p className="text-sm text-gray-600">
                              {product.category} • {product.variants.length} varyant • {product.images.length} görsel
                            </p>
                            <p className="text-xs text-gray-500">
                              {product.variants[0]?.price}₺
                            </p>
                          </div>
                        </div>
                        <Link
                          href={`/urunler/${product.slug}`}
                          target="_blank"
                          className="text-primary hover:underline text-sm"
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
                    className="flex items-start gap-2 p-3 bg-red-50 rounded-lg"
                  >
                    <XCircle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-red-800">{error}</p>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setResult(null)}
                className="flex-1 px-4 py-2 bg-primary text-white rounded-lg font-medium hover:bg-primary/90 transition-colors"
              >
                Tekrar Dene
              </button>
              <Link
                href="/admin/urunler"
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg font-medium hover:bg-gray-50 transition-colors text-center"
              >
                Ürün Listesine Git
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
