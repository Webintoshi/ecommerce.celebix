import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

// Tailwind class'larını birleştir
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Fiyat formatla (TL)
export function formatPrice(price: number): string {
  return new Intl.NumberFormat("tr-TR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(price) + "₺";
}

// Tarihi formatla
export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("tr-TR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

// Slug oluştur
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9ğüşıöçĞÜŞİÖÇ]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Discount hesapla
export function calculateDiscountPrice(
  price: number,
  discountPercentage: number
): number {
  return Math.round(price * (1 - discountPercentage / 100));
}

// Yıldız rating HTML
export function getStarRating(rating: number): string {
  const fullStars = Math.floor(rating);
  const hasHalfStar = rating % 1 >= 0.5;
  const emptyStars = 5 - fullStars - (hasHalfStar ? 1 : 0);

  return (
    "★".repeat(fullStars) +
    (hasHalfStar ? "½" : "") +
    "☆".repeat(emptyStars)
  );
}
