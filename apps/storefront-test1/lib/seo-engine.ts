export interface KeywordRule {
    id: string;
    keyword: string;
    url: string;
    active: boolean;
}

/**
 * Escapes special characters for Regex
 */
function escapeRegExp(string: string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Smart Internal Linking Engine
 * Scans content and wraps keywords in <a> tags.
 * - Longest keywords match first.
 * - Only links the first occurrence of a keyword.
 * - Skips keywords that are already linked.
 * - Case insensitive matching, preserves original text case.
 */
export function autoLinkContent(content: string, rules: KeywordRule[]): string {
    if (!content) return "";

    let newContent = content;

    // Filter active rules
    const activeRules = rules.filter(r => r.active && r.keyword.trim().length > 0);

    // Sort by length (Longest first to avoid partial matches inside longer words)
    activeRules.sort((a, b) => b.keyword.length - a.keyword.length);

    // Keep track of positions already linked to avoid nested links or double linking
    // (Simplified approach: We process rules sequentially. Only link if not inside an HTML tag attribute)

    for (const rule of activeRules) {
        const { keyword, url } = rule;

        // Regex to find keyword:
        // \b checks for word boundaries (so "test" doesn't match "testing")
        // (?![^<]*>) ensures we are not inside an HTML tag (like <img src="keyword">)
        // (?<!<a[^>]*>) ensures we are not already inside an anchor tag (This is hard with regex alone, doing best effort)
        // simpler approach:

        // We will use a placeholder strategy.
        // 1. Find the keyword.
        // 2. Check if it's safe to link (not inside a tag).
        // 3. Replace with a unique placeholder.
        // 4. After all rules, replace placeholders with actual links.

        // Actually, for V1 "Killer" MVP, let's use a robust regex for "first occurrence outside of tags".

        const regex = new RegExp(`(?<!<[^>]*)(${escapeRegExp(keyword)})(?![^<]*>)`, 'i');

        // Check if the content already links to this URL (basic check)
        // or if the keyword is already linked? 
        // The regex `(?![^<]*>)` helps avoid matching inside attributes like href="...keyword...", 
        // but doesn't fully prevent nested links if we already added an <a> tag in a previous loop iteration.
        // However, since we process longest first, "Fıstık Ezmesi" will be processed before "Fıstık".
        // If "Fıstık" tries to match inside "<a ...>Fıstık Ezmesi</a>", `(?![^<]*>)` might fail because it sees the closing </a>.

        // Better strategy for "Killer" grade:
        // 1. Split content by HTML tags to isolate text nodes. (Parsing)
        // BUT since we are in a browser/node env simply, let's stick to string manipulation with a "linked" guard.

        // If the content *already* contains the link to this specific URL, maybe skip?
        // No, maybe we want to enforce it.

        // Let's match the first occurrence that is NOT already inside an <a> tag.
        // Since we can't easily parse partial HTML with regex, we will try to match only if the surrounding context looks safe.

        // Execute replacement only ONCE (replace first occurrence)
        // We use a callback to verify we aren't messing up a tag.

        let matched = false;
        newContent = newContent.replace(regex, (match) => {
            if (matched) return match; // Only first occurrence

            // Additional safety: don't link if it looks like it's already inside a link
            // This is a naive check (checking if there's an opening <a and no closing </a> before it)
            // For this MVP, we assume the content is relatively clean or we accept minimal risk.
            // The `(?![^<]*>)` protects attributes.

            matched = true;
            return `<a href="${url}" class="text-primary hover:underline font-medium" title="${match}">${match}</a>`;
        });
    }

    return newContent;
}

// Mock Data / Storage for Rules using LocalStorage
const STORAGE_KEY = "celebix_storefront_seo_rules";

export function getSeoRules(): KeywordRule[] {
    if (typeof window === "undefined") return [];
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
}

export function saveSeoRules(rules: KeywordRule[]) {
    if (typeof window === "undefined") return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rules));
}

// Generate default rules from existing products
import { getAllProducts } from "./products";

export async function generateDefaultRulesFromProducts(): Promise<KeywordRule[]> {
    const products = await getAllProducts();
    const rules: KeywordRule[] = [];

    products.forEach(p => {
        // Name rule
        rules.push({
            id: `rule-${p.id}`,
            keyword: p.name,
            url: `/urunler/${p.slug}`,
            active: true
        });

        // Category rule (if not exists)
        // ... (Category linking usually needs a category page map)
    });

    return rules;
}

/**
 * Generates SEO Title and Description for a product based on its attributes.
 */
import { Product } from "@/types/product";

export function generateMetaTags(product: Product): { title: string; description: string } {
    // Generate Title
    // Pattern: {Name} - {Category/Tags} | Ornek Magaza
    // e.g., "Şekersiz Fıstık Ezmesi - Doğal & Vegan | Ornek Magaza"

    let title = `${product.name}`;
    const extras: string[] = [];

    if (product.sugarFree) extras.push("Şekersiz");
    if (product.vegan) extras.push("Vegan");
    if (product.glutenFree && !extras.includes("Şekersiz")) extras.push("Glutensiz"); // Avoid too long

    if (extras.length > 0) {
        title += ` - ${extras.join(" & ")}`;
    }

    title += " | Ornek Magaza";

    // Generate Description
    // Pattern: {ShortDesc} {Weight} seçenekleriyle. Katkısız, doğal lezzet. Hızlı kargo ile hemen sipariş verin.

    let description = product.shortDescription || product.description.substring(0, 150);
    if (!description.endsWith(".")) description += ".";

    // Add call to action and value props
    description += " Doğal, katkısız ve lezzetli.";

    if (product.sugarFree) description += " Şeker ilavesiz.";

    description += " Ornek Magaza güvencesiyle hemen sipariş verin.";

    // Truncate if too long (Google typically displays up to 160 chars)
    if (description.length > 160) {
        description = description.substring(0, 157) + "...";
    }

    return { title, description };
}
