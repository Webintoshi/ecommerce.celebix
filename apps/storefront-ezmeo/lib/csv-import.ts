import { Product, ProductVariant, ProductCategory, ProductSubcategory } from "@/types/product";

function parseCSV(csvContent: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = "";
  let inQuotes = false;
  
  for (let i = 0; i < csvContent.length; i++) {
    const char = csvContent[i];
    const nextChar = csvContent[i + 1];
    
    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          currentCell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        currentCell += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        currentRow.push(currentCell);
        currentCell = "";
      } else if (char === '\n' || (char === '\r' && nextChar === '\n')) {
        currentRow.push(currentCell);
        currentCell = "";
        if (currentRow.length > 0) {
          rows.push(currentRow);
        }
        currentRow = [];
        if (char === '\r') i++;
      } else if (char !== '\r') {
        currentCell += char;
      }
    }
  }
  
  if (currentCell || currentRow.length > 0) {
    currentRow.push(currentCell);
    rows.push(currentRow);
  }
  
  return rows;
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function determineCategory(handle: string, title: string): ProductCategory {
  const lowerHandle = handle.toLowerCase();
  const lowerTitle = title.toLowerCase();
  
  if (lowerHandle.includes("findik-kremasi") || lowerHandle.includes("findik-ezmesi") || lowerHandle.includes("kakaolu-findik")) {
    return "findik-ezmesi";
  }
  if (lowerHandle.includes("fistik-ezmesi")) {
    return "fistik-ezmesi";
  }
  if (
    lowerHandle.includes("cig-") || 
    lowerHandle.includes("kavrulmus-") ||
    lowerHandle.includes("yer-fistigi") ||
    lowerHandle.includes("badem") ||
    lowerHandle.includes("ceviz") ||
    lowerTitle.includes("kuruyemiş") ||
    (lowerTitle.includes("500g") && !lowerTitle.includes("ezmesi"))
  ) {
    return "kuruyemis";
  }
  
  return "fistik-ezmesi";
}

function determineSubcategory(handle: string, title: string): ProductSubcategory {
  const lowerHandle = handle.toLowerCase();
  const lowerTitle = title.toLowerCase();
  
  if (lowerHandle.includes("sekersiz") || lowerTitle.includes("şekersiz")) return "sekersiz";
  if (lowerHandle.includes("hurmali") || lowerTitle.includes("hurmalı")) return "hurmalı";
  if (lowerHandle.includes("balli") || lowerTitle.includes("ballı")) return "balli";
  if (lowerHandle.includes("klasik") || lowerTitle.includes("klasik")) return "klasik";
  if (lowerHandle.includes("sutlu") || lowerTitle.includes("sütlü")) return "sutlu-findik-kremasi";
  if (lowerHandle.includes("kakaolu") || lowerTitle.includes("kakaolu")) return "kakaolu";
  if (lowerHandle.includes("cig") || lowerTitle.includes("çiğ")) return "cig";
  if (lowerHandle.includes("kavrulmus") || lowerTitle.includes("kavrulmuş")) return "kavrulmus";
  
  return "klasik";
}

function parseDietaryPreferences(dietary: string): {
  vegan: boolean;
  glutenFree: boolean;
  sugarFree: boolean;
  highProtein: boolean;
} {
  const lower = dietary?.toLowerCase() || "";
  
  return {
    vegan: lower.includes("vegan"),
    glutenFree: lower.includes("gluten-free") || lower.includes("glutensiz"),
    sugarFree: lower.includes("no-artificial-sweeteners") || lower.includes("sekersiz"),
    highProtein: lower.includes("high-protein"),
  };
}

function generateSlug(handle: string): string {
  return handle
    .toLowerCase()
    .replace(/i̇/g, "i")
    .replace(/ı/g, "i")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function generateTags(title: string, dietary: string, category: ProductCategory): string[] {
  const tags: string[] = [];
  const lowerTitle = title.toLowerCase();
  const lowerDietary = dietary?.toLowerCase() || "";
  
  if (lowerDietary.includes("vegan")) tags.push("vegan");
  if (lowerDietary.includes("gluten-free")) tags.push("glutensiz");
  if (lowerDietary.includes("keto")) tags.push("keto");
  if (lowerDietary.includes("high-protein")) tags.push("yüksek protein");
  if (lowerDietary.includes("halal")) tags.push("helal");
  if (lowerDietary.includes("dairy-free")) tags.push("süt içermez");
  
  if (category === "kuruyemis") {
    tags.push("kuruyemiş");
    if (lowerTitle.includes("çiğ") || lowerTitle.includes("cig")) tags.push("çiğ");
    if (lowerTitle.includes("kavrulmuş") || lowerTitle.includes("kavrulmus")) tags.push("kavrulmuş");
  }
  
  if (category === "fistik-ezmesi") tags.push("fıstık ezmesi");
  if (category === "findik-ezmesi") tags.push("fındık ezmesi");
  
  tags.push("doğal", "katkısız");
  
  return [...new Set(tags)];
}

function getColumnIndex(headers: string[], ...searchTerms: string[]): number {
  for (const term of searchTerms) {
    const idx = headers.findIndex(h => h.toLowerCase().includes(term.toLowerCase()));
    if (idx !== -1) return idx;
  }
  return -1;
}

export function parseShopifyCSV(csvContent: string): Product[] {
  console.log("Starting CSV parse, content length:", csvContent.length);
  
  const rows = parseCSV(csvContent);
  console.log("Parsed rows:", rows.length);
  
  if (rows.length < 2) {
    console.error("CSV has less than 2 rows");
    return [];
  }
  
  const headers = rows[0];
  console.log("Headers:", headers.slice(0, 10).join(", "), "...");
  
  const handleIdx = getColumnIndex(headers, "handle");
  const titleIdx = getColumnIndex(headers, "title");
  const bodyIdx = getColumnIndex(headers, "body (html)", "body");
  const skuIdx = getColumnIndex(headers, "variant sku");
  const gramsIdx = getColumnIndex(headers, "variant grams");
  const priceIdx = getColumnIndex(headers, "variant price");
  const imageSrcIdx = getColumnIndex(headers, "image src");
  const statusIdx = getColumnIndex(headers, "status");
  const dietaryIdx = getColumnIndex(headers, "dietary-preferences", "diyet");
  
  console.log("Column indices:", { handleIdx, titleIdx, bodyIdx, priceIdx, imageSrcIdx, statusIdx });
  
  if (handleIdx === -1) {
    console.error("Handle column not found in headers");
    return [];
  }
  
  const productMap = new Map<string, {
    title: string;
    body: string;
    sku: string;
    grams: number;
    price: number;
    dietary: string;
    status: string;
    images: string[];
  }>();
  
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;
    
    const handle = row[handleIdx]?.trim();
    if (!handle) continue;
    
    const imageSrc = imageSrcIdx >= 0 ? (row[imageSrcIdx]?.trim() || "") : "";
    
    if (!productMap.has(handle)) {
      const title = titleIdx >= 0 ? (row[titleIdx]?.trim() || "") : "";
      const body = bodyIdx >= 0 ? (row[bodyIdx] || "") : "";
      const sku = skuIdx >= 0 ? (row[skuIdx]?.trim() || `SKU-${handle}`) : `SKU-${handle}`;
      const grams = gramsIdx >= 0 ? (parseFloat(row[gramsIdx]) || 450) : 450;
      const price = priceIdx >= 0 ? (parseFloat(row[priceIdx]) || 0) : 0;
      const dietary = dietaryIdx >= 0 ? (row[dietaryIdx]?.trim() || "") : "";
      const status = statusIdx >= 0 ? (row[statusIdx]?.trim()?.toLowerCase() || "active") : "active";
      
      if (title) {
        productMap.set(handle, {
          title,
          body,
          sku,
          grams,
          price,
          dietary,
          status,
          images: imageSrc ? [imageSrc] : [],
        });
        console.log(`Found product: ${handle} - ${title} - ${price}₺ - status: ${status}`);
      }
    } else {
      if (imageSrc) {
        const product = productMap.get(handle)!;
        if (!product.images.includes(imageSrc) && product.images.length < 5) {
          product.images.push(imageSrc);
        }
      }
    }
  }
  
  console.log(`Total unique products found: ${productMap.size}`);
  
  const products: Product[] = [];
  
  productMap.forEach((data, handle) => {
    if (data.status !== "active") {
      console.log(`Skipping ${handle}: status is ${data.status}`);
      return;
    }
    
    const category = determineCategory(handle, data.title);
    const subcategory = determineSubcategory(handle, data.title);
    const { vegan, glutenFree, sugarFree, highProtein } = parseDietaryPreferences(data.dietary);
    
    const slug = generateSlug(handle);
    const description = stripHtml(data.body);
    const shortDescription = description.substring(0, 200) + (description.length > 200 ? "..." : "");
    
    const variant: ProductVariant = {
      id: `${slug}-1pack`,
      name: data.grams >= 1000 ? `${data.grams / 1000}kg` : `${data.grams}g`,
      weight: data.grams,
      price: data.price,
      stock: 50,
      sku: data.sku,
    };
    
    const product: Product = {
      id: slug,
      name: data.title,
      slug: slug,
      description: description,
      shortDescription: shortDescription,
      category: category,
      subcategory: subcategory,
      variants: [variant],
      images: data.images.length > 0 ? data.images : ["/images/products/placeholder.jpg"],
      tags: generateTags(data.title, data.dietary, category),
      vegan: vegan,
      glutenFree: glutenFree,
      sugarFree: sugarFree,
      highProtein: highProtein,
      rating: 5,
      reviewCount: 0,
      featured: category !== "kuruyemis",
      new: false,
    };
    
    products.push(product);
    console.log(`Created: ${product.name} (${product.category}) - ${product.images.length} images - ${product.variants[0].price}₺`);
  });
  
  console.log(`Final product count: ${products.length}`);
  return products;
}

export function importProductsFromCSV(csvContent: string): {
  success: boolean;
  products: Product[];
  message: string;
} {
  try {
    const products = parseShopifyCSV(csvContent);
    
    if (products.length === 0) {
      return {
        success: false,
        products: [],
        message: "CSV dosyasında geçerli ürün bulunamadı.",
      };
    }
    
    return {
      success: true,
      products: products,
      message: `${products.length} ürün başarıyla parse edildi.`,
    };
  } catch (error) {
    console.error("CSV parse error:", error);
    return {
      success: false,
      products: [],
      message: `CSV parse hatası: ${error instanceof Error ? error.message : "Bilinmeyen hata"}`,
    };
  }
}
