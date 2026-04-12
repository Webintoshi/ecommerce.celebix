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
    <main className="min-h-screen bg-gradient-to-br from-[#faf8f5] via-[#f5efe8] to-[#efe5dc]">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-20 right-[-8rem] h-[22rem] w-[22rem] rounded-full bg-[#FE6100]/10 blur-3xl" />
        <div className="absolute left-[-6rem] top-[30%] h-[18rem] w-[18rem] rounded-full bg-amber-200/30 blur-3xl" />
        <div className="absolute bottom-[-6rem] right-[18%] h-[18rem] w-[18rem] rounded-full bg-orange-100/40 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-7xl px-4 py-6 md:px-6 md:py-8 lg:px-8">
      <div className="space-y-6">
        <section className="overflow-hidden rounded-[30px] border border-[#FE6100]/10 bg-gradient-to-br from-white via-[#fffdfa] to-[#faf4ed] shadow-[0_24px_80px_rgba(254,97,0,0.12)]">
          <div className="border-b border-[#FE6100]/8 px-5 py-5 md:px-8 md:py-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-3">
                <div className="inline-flex w-fit items-center rounded-full border border-[#FE6100]/20 bg-gradient-to-r from-[#FE6100]/10 to-[#FF8B3D]/5 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.24em] text-[#FE6100]">
                  Shopify donusturucu
                </div>
                <h1 className="sr-only">Shopify → Celebix Panel Donusturucu</h1>
                <p className="max-w-2xl text-sm leading-6 text-[#786658]">
                  Shopify ciktilarini panelin toplu yukleme yapisina sicak, daha rahat taranan bir is akisi icinde hazirlayin.
                </p>
              </div>
              <Link
                href="/admin/urunler"
                className="inline-flex items-center justify-center rounded-2xl border border-[#FE6100]/15 bg-white px-4 py-3 text-sm font-semibold text-[#8a4b22] shadow-sm transition hover:border-[#FE6100]/30 hover:bg-[#fff7f1] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FE6100]/20"
              >
                Geri Dön
              </Link>
            </div>
          </div>
        </section>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main Section */}
        <div className="lg:col-span-2 space-y-6">
          {/* Instructions */}
          <section className="rounded-[30px] border border-[#ecdccd] bg-gradient-to-br from-white/95 via-[#fffdfa] to-[#f6eee6] p-5 shadow-[0_24px_55px_rgba(98,64,33,0.09)] md:p-6">
            <div className="rounded-[26px] border border-amber-200/70 bg-gradient-to-br from-amber-50 to-white p-6 shadow-sm">
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#FE6100] to-[#E45700] shadow-[0_18px_35px_rgba(254,97,0,0.18)]">
                <Info className="h-5 w-5 text-white" />
              </div>
              <div>
                <h3 className="mb-2 font-semibold text-[#2f241d]">
                  Nasıl Çalışır?
                </h3>
                <ol className="space-y-2 text-sm text-[#6f5a4b] list-decimal list-inside">
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
          </section>

          {/* Upload Area */}
          <section className="rounded-[30px] border border-[#ecdccd] bg-gradient-to-br from-white/95 via-[#fffdfa] to-[#f6eee6] p-6 shadow-[0_24px_55px_rgba(98,64,33,0.09)] md:p-8">
            <div className="text-center">
              <div className="flex items-center justify-center gap-4 mb-6">
                <div className="flex h-16 w-16 items-center justify-center rounded-[24px] bg-sky-100">
                  <FileSpreadsheet className="w-8 h-8 text-blue-600" />
                </div>
                <ArrowRight className="w-8 h-8 text-gray-400" />
                <div className="flex h-16 w-16 items-center justify-center rounded-[24px] bg-gradient-to-br from-[#fff0e3] to-[#f6deca] shadow-[0_18px_35px_rgba(254,97,0,0.12)]">
                  <FileSpreadsheet className="w-8 h-8 text-[#FE6100]" />
                </div>
              </div>

              {!file ? (
                <>
                  <h3 className="mb-2 text-xl font-semibold text-[#2f241d]">
                    Shopify CSV Dosyası Yükle
                  </h3>
                  <p className="mb-6 text-[#786658]">
                    Shopify'dan dışa aktardığınız CSV dosyasını seçin
                  </p>

                  <label className="inline-block">
                    <input
                      type="file"
                      accept=".csv"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                    <span className="inline-block cursor-pointer rounded-2xl bg-gradient-to-r from-[#FE6100] to-[#E45700] px-6 py-3 text-sm font-semibold text-white shadow-[0_18px_35px_rgba(254,97,0,0.24)] transition hover:from-[#f05c00] hover:to-[#d84f00] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FE6100]/20">
                      Shopify CSV Seç
                    </span>
                  </label>

                  <p className="mt-4 text-xs text-[#8b6d58]">
                    Sadece Shopify CSV formatı desteklenir
                  </p>
                </>
              ) : (
                <>
                  <div className="mb-6 inline-flex items-center gap-3 rounded-[24px] border border-[#ecdccd] bg-white/90 px-6 py-4 shadow-sm">
                    <FileSpreadsheet className="w-6 h-6 text-blue-600" />
                    <div className="text-left">
                      <p className="font-medium text-[#2f241d]">{file.name}</p>
                      <p className="text-sm text-[#8b6d58]">
                        {(file.size / 1024).toFixed(2)} KB
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col justify-center gap-3 sm:flex-row">
                    <button
                      onClick={handleConvert}
                      disabled={converting}
                      className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#FE6100] to-[#E45700] px-6 py-3 text-sm font-semibold text-white shadow-[0_18px_35px_rgba(254,97,0,0.24)] transition hover:from-[#f05c00] hover:to-[#d84f00] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FE6100]/20 disabled:pointer-events-none disabled:opacity-60"
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
                      className="rounded-2xl border border-[#FE6100]/15 bg-white px-6 py-3 text-sm font-semibold text-[#8a4b22] shadow-sm transition hover:border-[#FE6100]/30 hover:bg-[#fff7f1] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FE6100]/20"
                    >
                      İptal
                    </button>
                  </div>
                </>
              )}
            </div>
          </section>

          {/* Results */}
          {result && (
            <section className="rounded-[30px] border border-[#ecdccd] bg-gradient-to-br from-white/95 via-[#fffdfa] to-[#f6eee6] p-5 shadow-[0_24px_55px_rgba(98,64,33,0.09)] md:p-6">
              <div className="flex items-center gap-3 mb-4">
                <CheckCircle className="w-6 h-6 text-green-600" />
                <h3 className="text-lg font-semibold text-[#2f241d]">
                  Dönüştürme Tamamlandı!
                </h3>
              </div>

              <div className="mb-4 rounded-[24px] border border-emerald-200/70 bg-gradient-to-br from-emerald-50 to-white p-4 shadow-sm">
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
                        className={`flex items-start gap-2 rounded-2xl border p-3 ${
                          warning.startsWith("✅") ? "border-emerald-200/70 bg-emerald-50" : "border-amber-200/70 bg-amber-50"
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

              <div className="mt-6 border-t border-[#efdfd1] pt-6">
                <h4 className="mb-3 font-medium text-[#2f241d]">Sonraki Adımlar:</h4>
                <ol className="space-y-2 text-sm text-[#786658] list-decimal list-inside">
                  <li>Indirilen <strong>celebix-panel-urunler.csv</strong> dosyasini Excel ile acin</li>
                  <li>Besin değerlerini (Kalori, Protein, vb.) manuel olarak doldurun</li>
                  <li>"Öne Çıkan" ve "Yeni" alanlarını ayarlayın</li>
                  <li>Dosyayı UTF-8 encoding ile kaydedin</li>
                  <li>
                    <Link href="/admin/urunler/toplu-yukle" className="font-medium text-[#C94E00] transition hover:text-[#a54100] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FE6100]/15">
                      Toplu Yükleme
                    </Link>
                    {" "}sayfasından yükleyin
                  </li>
                </ol>
              </div>
            </section>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Mapping Info */}
          <section className="rounded-[30px] border border-[#ecdccd] bg-gradient-to-br from-white/95 via-[#fffdfa] to-[#f6eee6] p-6 shadow-[0_24px_55px_rgba(98,64,33,0.09)]">
            <h3 className="mb-4 font-semibold text-[#2f241d]">
              Otomatik Eşleştirmeler
            </h3>
            <div className="space-y-3 text-sm">
              <div className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium text-[#2f241d]">Ürün Bilgileri</p>
                  <p className="text-[#786658]">Ad, Slug, Açıklama</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium text-[#2f241d]">Görseller</p>
                  <p className="text-[#786658]">Shopify'dan otomatik çekiliyor!</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium text-[#2f241d]">Varyantlar</p>
                  <p className="text-[#786658]">Tüm varyantlar gruplandırılır</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium text-[#2f241d]">Fiyatlar</p>
                  <p className="text-[#786658]">Normal ve indirimli fiyatlar</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium text-[#2f241d]">Kategoriler</p>
                  <p className="text-[#786658]">Ürün tipinden otomatik</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium text-[#2f241d]">Özellikler</p>
                  <p className="text-[#786658]">Etiketlerden otomatik</p>
                </div>
              </div>
            </div>
          </section>

          {/* Manual Fields */}
          <section className="rounded-[30px] border border-amber-200/70 bg-gradient-to-br from-amber-50 to-white p-6 shadow-sm">
            <h3 className="mb-3 font-semibold text-amber-900">
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
          </section>

          {/* Quick Link */}
          <Link
            href="/admin/urunler/toplu-yukle"
            className="block rounded-[30px] bg-gradient-to-r from-[#FE6100] to-[#E45700] p-6 text-white shadow-[0_20px_45px_rgba(254,97,0,0.24)] transition hover:translate-y-[-1px] hover:from-[#f05c00] hover:to-[#d84f00] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FE6100]/20"
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
      </div>
    </main>
  );
}
