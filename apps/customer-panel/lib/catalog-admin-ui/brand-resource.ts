import type { CatalogAdminJson } from "@celebix/saas-contracts";
import { attributeSlug } from "../catalog-onboarding-ui/attribute-resource.ts";

type BrandMutation = Readonly<{ resourceId?: string; expectedVersion?: number; name: string; slug: string; description?: string; config: Readonly<Record<string, CatalogAdminJson>>; productIds: readonly string[] }>;
type BrandApi<T> = Readonly<{ resources(kind: "brand"): Promise<readonly Readonly<{ slug: string }>[]>; saveResource(kind: "brand", value: BrandMutation): Promise<T> }>;

export function nextBrandSlug(name: string, occupied: ReadonlySet<string>): string {
  const base = attributeSlug(name) || "marka";
  for (let suffix = 1; ; suffix += 1) {
    const ending = suffix === 1 ? "" : `-${suffix}`;
    const slug = base.slice(0, 120 - ending.length).replace(/-$/g, "") + ending;
    if (!occupied.has(slug)) return slug;
  }
}

export async function saveBrandResource<T>(api: BrandApi<T>, input: Omit<BrandMutation, "slug"> & Readonly<{ existingSlug?: string }>): Promise<T> {
  const { existingSlug, ...mutation } = input;
  if (mutation.resourceId && existingSlug) return api.saveResource("brand", { ...mutation, slug: existingSlug });
  const occupied = new Set((await api.resources("brand")).map((resource) => resource.slug));
  // A concurrent create may claim the same name after the read.
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const slug = nextBrandSlug(mutation.name, occupied);
    try { return await api.saveResource("brand", { ...mutation, slug }); }
    catch (error) {
      if (!(error instanceof Error) || !("code" in error) || error.code !== "slug_conflict" || attempt === 19) throw error;
      occupied.add(slug);
    }
  }
  throw new Error("brand_name_conflict");
}
