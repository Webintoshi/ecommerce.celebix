import type { SeoResourceKind } from "@celebix/saas-contracts";
import type { PublicSeoSelection, PublicSeoSettings } from "./public-seo.ts";

export type PublicSeoReader = Readonly<{
  get(input: Readonly<{ hostname: string; now: Date; kind: SeoResourceKind; id: string }>): Promise<PublicSeoSelection>;
  settings(input: Readonly<{ hostname: string; now: Date }>): Promise<PublicSeoSettings & Readonly<{ metaTitle: string | null; metaDescription: string | null; hostname: string | null; indexNowEnabled: boolean }>>;
  key(input: Readonly<{ hostname: string; now: Date }>): Promise<Readonly<{ key: string | null }>>;
}>;
export async function loadPublicResourceSeo(reader: PublicSeoReader | null | undefined, hostname: string, kind: SeoResourceKind, id: string): Promise<PublicSeoSelection | null> {
  if (!reader) return null;
  try { return await reader.get({ hostname, kind, id, now: new Date() }); }
  catch (cause) { throw new Error("storefront_public_seo_unavailable", { cause }); }
}
export async function loadPublicSeoSettings(reader: PublicSeoReader | null | undefined, hostname: string) {
  if (!reader) return null;
  try { return await reader.settings({ hostname, now: new Date() }); }
  catch (cause) { throw new Error("storefront_public_seo_unavailable", { cause }); }
}
