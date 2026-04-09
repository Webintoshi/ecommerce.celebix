import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

// Merge Tailwind classes safely.
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Format only the numeric portion of a price (e.g. 2345 -> 2.345).
export function formatPriceValue(price: number): string {
  return new Intl.NumberFormat("tr-TR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(price);
}

// Format price with Turkish lira symbol.
export function formatPrice(price: number): string {
  return formatPriceValue(price) + "\u20BA";
}

// Format dates in Turkish locale.
export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("tr-TR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

// Build slugs from Turkish text.
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9ğüşiöçĞÜŞİÖÇ]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Calculate discounted price.
export function calculateDiscountPrice(
  price: number,
  discountPercentage: number
): number {
  return Math.round(price * (1 - discountPercentage / 100));
}

// Return a star rating string.
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
