"use client";

import { useState } from "react";
import { Upload, Download, ArrowRight, FileSpreadsheet, CheckCircle, AlertCircle, Info } from "lucide-react";
import Link from "next/link";

interface ConversionResult {
  converted: number;
  warnings: string[];
}

export default function ShopifyConverterPage() {
  const [file, setFile] = useState<File | null>(null);
  const [converting, setConverting] = useState(false);
  const [result, setResult] = useState<ConversionResult | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setResult(null);
    }
  };

  const parseCSVLine = (line: string): string[] => {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === "," && !inQuotes) {
        result.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  };

  const handleConvert = async () => {
    if (!file) return;

    setConverting(true);

    const reader = new FileReader();
    reader.onload = async (e) => {
      const text = e.target?.result as string;
      const lines = text.split("\n").filter(line => line.trim());
      
      if (lines.length === 0) {
        alert("CSV dosyası boş!");
        setConverting(false);
        return;
      }

      const headers = parseCSVLine(lines[0]);

      // Find Shopify column indices
      const handleIdx = headers.findIndex(h => h.toLowerCase() === "handle");
      const titleIdx = headers.findIndex(h => h.toLowerCase() === "title");
      const bodyIdx = headers.findIndex(h => h.toLowerCase().includes("body"));
      const typeIdx = headers.findIndex(h => h.toLowerCase() === "type");
      const tagsIdx = headers.findIndex(h => h.toLowerCase() === "tags");
      const imageSrcIdx = headers.findIndex(h => h.toLowerCase().includes("image src"));
      const imagePositionIdx = headers.findIndex(h => h.toLowerCase().includes("image position"));
      const variantTitleIdx = headers.findIndex(h => h.toLowerCase().includes("option1 value"));
      const variantPriceIdx = headers.findIndex(h => h.toLowerCase().includes("variant price"));
      const variantCompareIdx = headers.findIndex(h => h.toLowerCase().includes("variant compare"));
      const variantSKUIdx = headers.findIndex(h => h.toLowerCase().includes("variant sku"));
      const variantGramsIdx = headers.findIndex(h => h.toLowerCase().includes("variant grams"));
      const variantQtyIdx = headers.findIndex(h => h.toLowerCase().includes("variant inventory qty"));

      // Group products by handle
      const productMap = new Map<string, any>();
      const warnings: string[] = [];

      for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;

        const cols = parseCSVLine(lines[i]);
        const handle = cols[handleIdx] || "";
        
        if (!handle) continue;

        if (!productMap.has(handle)) {
          // New product
          const title = cols[titleIdx] || "";
          const body = cols[bodyIdx] || "";
          const type = cols[typeIdx] || "";
          const tags = cols[tagsIdx] || "";
          const imageSrc = cols[imageSrcIdx] || "";

          // Map category
          let category = "fistik-ezmesi";
          const typeLower = type.toLowerCase();
          if (typeLower.includes("fındık") || typeLower.includes("findik") || typeLower.includes("hazelnut")) {
            category = "findik-ezmesi";
          } else if (typeLower.includes("kuruyemiş") || typeLower.includes("kuruyemis") || typeLower.includes("nut")) {
            category = "kuruyemis";
          }

          // Map subcategory from tags
          let subCategory = "klasik";
          const tagsLower = tags.toLowerCase();
          if (tagsLower.includes("şekersiz") || tagsLower.includes("sekersiz") || tagsLower.includes("sugar free")) {
            subCategory = "sekersiz";
          } else if (tagsLower.includes("hurmalı") || tagsLower.includes("hurmali") || tagsLower.includes("date")) {
            subCategory = "hurmali";
          } else if (tagsLower.includes("ballı") || tagsLower.includes("balli") || tagsLower.includes("honey")) {
            subCategory = "balli";
          } else if (tagsLower.includes("sütlü") || tagsLower.includes("sutlu") || tagsLower.includes("milk")) {
            subCategory = "sutlu-findik-kremasi";
          } else if (tagsLower.includes("kakaolu") || tagsLower.includes("cocoa") || tagsLower.includes("chocolate")) {
            subCategory = "kakaolu";
          } else if (tagsLower.includes("çiğ") || tagsLower.includes("cig") || tagsLower.includes("raw")) {
            subCategory = "cig";
          } else if (tagsLower.includes("kavrulmuş") || tagsLower.includes("kavrulmus") || tagsLower.includes("roasted")) {
            subCategory = "kavrulmus";
          }

          // Check tags for properties
          const isVegan = tagsLower.includes("vegan") ? "Evet" : "Hayır";
          const isGlutenFree = tagsLower.includes("gluten") ? "Evet" : "Hayır";
          const isSugarFree = tagsLower.includes("şekersiz") || tagsLower.includes("sekersiz") || tagsLower.includes("sugar free") ? "Evet" : "Hayır";
          const isHighProtein = tagsLower.includes("protein") || tagsLower.includes("sporcu") ? "Evet" : "Hayır";

          productMap.set(handle, {
            title,
            handle,
            body: body.replace(/<[^>]*>/g, "").replace(/"/g, '""'),
            shortDesc: body.replace(/<[^>]*>/g, "").substring(0, 150).replace(/"/g, '""'),
            category,
            subCategory,
            tags: tags.replace(/"/g, '""'),
            isVegan,
            isGlutenFree,
            isSugarFree,
            isHighProtein,
            images: imageSrc ? [imageSrc] : [],
            variants: []
          });
        } else {
          // Add image if it's a new one - her satırda görsel olabilir
          const imageSrc = cols[imageSrcIdx] || "";
          
          if (imageSrc && imageSrc.trim()) {
            const product = productMap.get(handle)!;
            // Aynı görseli tekrar ekleme, maksimum 10 görsel
            if (product && !product.images.includes(imageSrc) && product.images.length < 10) {
              product.images.push(imageSrc);
            }
          }
        }

        // Add variant
        const product = productMap.get(handle);
        const variantTitle = cols[variantTitleIdx] || "";
        const price = cols[variantPriceIdx] || "";
        const comparePrice = cols[variantCompareIdx] || "";
        const sku = cols[variantSKUIdx] || "";
        const grams = cols[variantGramsIdx] || "";
        const qty = cols[variantQtyIdx] || "0";

        product.variants.push({
          name: variantTitle,
          weight: grams,
          price,
          comparePrice,
          sku,
          qty
        });
      }

      // Convert to Celebix Panel format
      const convertedLines = [
        "Ürün Adı,Slug,Açıklama,Kısa Açıklama,Kategori,Alt Kategori,Varyant Adı,Ağırlık (g),Fiyat (TL),İndirimli Fiyat (TL),Stok,SKU,Görsel URL 1,Görsel URL 2,Görsel URL 3,Kalori,Protein (g),Karbonhidrat (g),Yağ (g),Lif (g),Şeker (g),Vegan,Glutensiz,Şekersiz,Yüksek Protein,Öne Çıkan,Yeni,Etiketler"
      ];

      let converted = 0;

      productMap.forEach((product) => {
        product.variants.forEach((variant: any) => {
          const line = [
            `"${product.title}"`,
            product.handle,
            `"${product.body}"`,
            `"${product.shortDesc}"`,
            product.category,
            product.subCategory,
            `"${variant.name}"`,
            variant.weight,
            variant.price,
            variant.comparePrice || "",
            variant.qty,
            variant.sku,
            product.images[0] || "",
            product.images[1] || "",
            product.images[2] || "",
            "", // Kalori - manuel
            "", // Protein - manuel
            "", // Karbonhidrat - manuel
            "", // Yağ - manuel
            "", // Lif - manuel
            "", // Şeker - manuel
            product.isVegan,
            product.isGlutenFree,
            product.isSugarFree,
            product.isHighProtein,
            "Hayır", // Öne Çıkan - manuel
            "Hayır", // Yeni - manuel
            `"${product.tags}"`
          ].join(",");

          convertedLines.push(line);
          converted++;
        });
      });

      if (converted === 0) {
        warnings.push("⚠️ Hiçbir ürün dönüştürülemedi. CSV formatını kontrol edin.");
      } else {
        warnings.push("✅ Ürün görselleri Shopify'dan otomatik olarak alındı");
        warnings.push("⚠️ Besin değerleri (Kalori, Protein, vb.) manuel olarak eklenmelidir");
        warnings.push("⚠️ 'Öne Çıkan' ve 'Yeni' alanları manuel olarak ayarlanmalıdır");
      }

      // Download converted file
      const blob = new Blob(["\uFEFF" + convertedLines.join("\n")], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = "celebix-panel-urunler.csv";
      link.click();

      setResult({
        converted,
        warnings
      });
      setConverting(false);
    };

    reader.readAsText(file, "UTF-8");
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Shopify → Celebix Panel Donusturucu
          </h1>
          <p className="text-gray-600">
            Shopify CSV dosyanizi Celebix Panel formatina donusturun (Gorseller dahil)
          </p>
        </div>
        <Link
          href="/admin/urunler"
          className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          Geri Dön
        </Link>
      </div>

      <div className="grid lg:grid-cols-3 gap-8">
        {/* Main Section */}
        <div className="lg:col-span-2 space-y-6">
          {/* Instructions */}
          <div className="bg-gradient-to-br from-primary/10 to-secondary/20 border border-primary/20 rounded-xl p-6">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center flex-shrink-0">
                <Info className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">
                  Nasıl Çalışır?
                </h3>
                <ol className="text-sm text-gray-700 space-y-2 list-decimal list-inside">
                  <li>Shopify Admin → Ürünler → "Dışa Aktar" butonuna tıklayın</li>
                  <li>"Tüm ürünler" ve "CSV for Excel" seçeneklerini seçin</li>
                  <li>İndirilen CSV dosyasını buraya yükleyin</li>
                  <li>"Dönüştür" butonuna tıklayın</li>
                  <li>Otomatik olarak Celebix Panel formatinda indirilecek (Gorseller dahil)</li>
                  <li>Besin değerlerini manuel olarak ekleyin</li>
                  <li>İndirilen dosyayı "Toplu Yükleme" sayfasından yükleyin</li>
                </ol>
              </div>
            </div>
          </div>

          {/* Upload Area */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
            <div className="text-center">
              <div className="flex items-center justify-center gap-4 mb-6">
                <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
                  <FileSpreadsheet className="w-8 h-8 text-blue-600" />
                </div>
                <ArrowRight className="w-8 h-8 text-gray-400" />
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
                  <FileSpreadsheet className="w-8 h-8 text-primary" />
                </div>
              </div>

              {!file ? (
                <>
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">
                    Shopify CSV Dosyası Yükle
                  </h3>
                  <p className="text-gray-600 mb-6">
                    Shopify'dan dışa aktardığınız CSV dosyasını seçin
                  </p>

                  <label className="inline-block">
                    <input
                      type="file"
                      accept=".csv"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                    <span className="px-6 py-3 bg-primary text-white rounded-lg font-medium hover:bg-primary/90 transition-colors cursor-pointer inline-block">
                      Shopify CSV Seç
                    </span>
                  </label>

                  <p className="text-xs text-gray-500 mt-4">
                    Sadece Shopify CSV formatı desteklenir
                  </p>
                </>
              ) : (
                <>
                  <div className="inline-flex items-center gap-3 px-6 py-4 bg-gray-50 rounded-lg mb-6">
                    <FileSpreadsheet className="w-6 h-6 text-blue-600" />
                    <div className="text-left">
                      <p className="font-medium text-gray-900">{file.name}</p>
                      <p className="text-sm text-gray-500">
                        {(file.size / 1024).toFixed(2)} KB
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-3 justify-center">
                    <button
                      onClick={handleConvert}
                      disabled={converting}
                      className="px-6 py-3 bg-primary text-white rounded-lg font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      {converting ? (
                        "Dönüştürülüyor..."
                      ) : (
                        <>
                          <ArrowRight className="w-5 h-5" />
                          Dönüştür
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => {
                        setFile(null);
                        setResult(null);
                      }}
                      className="px-6 py-3 border border-gray-300 rounded-lg font-medium hover:bg-gray-50 transition-colors"
                    >
                      İptal
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Results */}
          {result && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="flex items-center gap-3 mb-4">
                <CheckCircle className="w-6 h-6 text-green-600" />
                <h3 className="text-lg font-semibold text-gray-900">
                  Dönüştürme Tamamlandı!
                </h3>
              </div>

              <div className="bg-green-50 rounded-lg p-4 mb-4">
                <p className="text-green-900 font-medium">
                  {result.converted} varyant başarıyla dönüştürüldü
                </p>
                <p className="text-sm text-green-700 mt-1">
                  Dosya otomatik olarak indirildi: <strong>celebix-panel-urunler.csv</strong>
                </p>
              </div>

              {result.warnings.length > 0 && (
                <div>
                  <h4 className="font-medium text-gray-900 mb-3">Bilgilendirme:</h4>
                  <div className="space-y-2">
                    {result.warnings.map((warning, index) => (
                      <div
                        key={index}
                        className={`flex items-start gap-2 p-3 rounded-lg ${
                          warning.startsWith("✅") ? "bg-green-50" : "bg-yellow-50"
                        }`}
                      >
                        <AlertCircle className={`w-4 h-4 mt-0.5 flex-shrink-0 ${
                          warning.startsWith("✅") ? "text-green-600" : "text-yellow-600"
                        }`} />
                        <p className={`text-sm ${
                          warning.startsWith("✅") ? "text-green-800" : "text-yellow-800"
                        }`}>{warning}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-6 pt-6 border-t border-gray-200">
                <h4 className="font-medium text-gray-900 mb-3">Sonraki Adımlar:</h4>
                <ol className="text-sm text-gray-700 space-y-2 list-decimal list-inside">
                  <li>Indirilen <strong>celebix-panel-urunler.csv</strong> dosyasini Excel ile acin</li>
                  <li>Besin değerlerini (Kalori, Protein, vb.) manuel olarak doldurun</li>
                  <li>"Öne Çıkan" ve "Yeni" alanlarını ayarlayın</li>
                  <li>Dosyayı UTF-8 encoding ile kaydedin</li>
                  <li>
                    <Link href="/admin/urunler/toplu-yukle" className="text-primary hover:underline font-medium">
                      Toplu Yükleme
                    </Link>
                    {" "}sayfasından yükleyin
                  </li>
                </ol>
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Mapping Info */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h3 className="font-semibold text-gray-900 mb-4">
              Otomatik Eşleştirmeler
            </h3>
            <div className="space-y-3 text-sm">
              <div className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium text-gray-900">Ürün Bilgileri</p>
                  <p className="text-gray-600">Ad, Slug, Açıklama</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium text-gray-900">Görseller 🎨</p>
                  <p className="text-gray-600">Shopify'dan otomatik çekiliyor!</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium text-gray-900">Varyantlar</p>
                  <p className="text-gray-600">Tüm varyantlar gruplandırılır</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium text-gray-900">Fiyatlar</p>
                  <p className="text-gray-600">Normal ve indirimli fiyatlar</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium text-gray-900">Kategoriler</p>
                  <p className="text-gray-600">Ürün tipinden otomatik</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium text-gray-900">Özellikler</p>
                  <p className="text-gray-600">Etiketlerden otomatik</p>
                </div>
              </div>
            </div>
          </div>

          {/* Manual Fields */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6">
            <h3 className="font-semibold text-yellow-900 mb-3">
              ⚠️ Manuel Doldurulacaklar
            </h3>
            <ul className="text-sm text-yellow-800 space-y-2">
              <li>• Kalori değeri (100g başına)</li>
              <li>• Protein (g)</li>
              <li>• Karbonhidrat (g)</li>
              <li>• Yağ (g)</li>
              <li>• Lif (g)</li>
              <li>• Şeker (g)</li>
              <li>• Öne Çıkan (Evet/Hayır)</li>
              <li>• Yeni (Evet/Hayır)</li>
            </ul>
          </div>

          {/* Quick Link */}
          <Link
            href="/admin/urunler/toplu-yukle"
            className="block bg-primary text-white rounded-xl p-6 hover:bg-primary/90 transition-colors"
          >
            <div className="flex items-center gap-3 mb-2">
              <Upload className="w-6 h-6" />
              <h3 className="font-semibold">Toplu Yükleme</h3>
            </div>
            <p className="text-sm text-white/80">
              Dönüştürülen dosyayı buradan yükleyin
            </p>
          </Link>
        </div>
      </div>
    </div>
  );
}
