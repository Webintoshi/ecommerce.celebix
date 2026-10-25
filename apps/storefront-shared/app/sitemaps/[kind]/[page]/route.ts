import { createLegacySitemapRedirect } from "@/lib/sitemap-public-routes.ts";

export const dynamic = "force-dynamic";
export async function GET(_request: Request, { params }: Readonly<{ params: Promise<{ kind: string; page: string }> }>) {
  const { kind, page } = await params;
  return createLegacySitemapRedirect(kind, page);
}
