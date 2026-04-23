import { Product } from "@/types/product";

const STORAGE_KEY = "celebix_storefront_products_v2";

// Get products from localStorage
export function getStoredProducts(): Product[] {
  if (typeof window === "undefined") return [];

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (error) {
    console.error("Error loading products from storage:", error);
  }

  return [];
}

// Save products to localStorage
export function saveProducts(products: Product[]): void {
  if (typeof window === "undefined") return;

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(products));
  } catch (error) {
    console.error("Error saving products to storage:", error);
  }
}

// Add a single product
export function addStoredProduct(product: Product): void {
  const products = getStoredProducts();

  // Check if product with same slug exists
  const existingIndex = products.findIndex(p => p.slug === product.slug);

  if (existingIndex >= 0) {
    // Update existing product
    products[existingIndex] = product;
  } else {
    // Add new product
    products.push(product);
  }

  saveProducts(products);
}

// Add multiple products
export function addStoredProducts(newProducts: Product[]): void {
  const products = getStoredProducts();

  newProducts.forEach(newProduct => {
    const existingIndex = products.findIndex(p => p.slug === newProduct.slug);

    if (existingIndex >= 0) {
      // Update existing product
      products[existingIndex] = newProduct;
    } else {
      // Add new product
      products.push(newProduct);
    }
  });

  saveProducts(products);
}

// Delete a product
export function deleteStoredProduct(id: string): void {
  const products = getStoredProducts();
  const filtered = products.filter(p => p.id !== id);
  saveProducts(filtered);
}

// Update a product
export function updateStoredProduct(id: string, updates: Partial<Product>): void {
  const products = getStoredProducts();
  const index = products.findIndex(p => p.id === id);

  if (index >= 0) {
    products[index] = { ...products[index], ...updates };
    saveProducts(products);
  }
}

// Clear all products
export function clearStoredProducts(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
}

// Initialize with default products if empty
export function initializeProducts(defaultProducts: Product[]): void {
  const stored = getStoredProducts();

  if (stored.length === 0) {
    saveProducts(defaultProducts);
  }
}
