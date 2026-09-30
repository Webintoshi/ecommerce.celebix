import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { PublicStorefrontRepositoryError } from "@celebix/saas-data";
import { StorefrontFrame } from "@/components/StorefrontFrame";
import { ProductExplorer } from "@/components/ProductExplorer";
import { resolveStorefrontPage } from "@/lib/page-context.ts";
import { requireStorefrontPage } from "@/lib/page-resolution.ts";
import { parseProductCatalogQuery, PRODUCT_CATALOG_PAGE_SIZE } from "@/lib/product-catalog-query.ts";
import { collectionPath, storefrontRouteVariant, type StorefrontRouteVariant } from "@/lib/storefront-routes.ts";
import styles from "./collection.module.css";

type Params = Readonly<{ params: Promise<{ slug: string }> }>;
async function collection(slug: string, search: Readonly<Record<string, string | string[] | undefined>> = {}) {
 const { runtime, storefront, design } = requireStorefrontPage(await resolveStorefrontPage());
 if (!runtime.repository.queryPublicCollection) throw new Error("public_collection_query_unavailable");
 const selection = parseProductCatalogQuery(search);
 try {
  const page = await runtime.repository.queryPublicCollection({ storefront, now: new Date(), slug, query: selection.query, filter: selection.filter, order: selection.order, limit: PRODUCT_CATALOG_PAGE_SIZE, offset: selection.offset });
  return { storefront, design, page, selection };
 } catch (error) {
  if (error instanceof PublicStorefrontRepositoryError && (error.code === "not_found" || error.code === "invalid_input")) notFound();
  throw error;
 }
}
export async function generateCollectionMetadata({ params }: Params): Promise<Metadata> {
 const { storefront, page } = await collection((await params).slug);
 return { title: `${page.collection.name} | ${storefront.presentation.displayName}`, description: page.collection.description ?? `${page.collection.name} koleksiyonunu keşfedin.`, robots: { index: storefront.presentation.seo.allowIndex, follow: storefront.presentation.seo.allowIndex }, alternates: { canonical: new URL(collectionPath(storefront.locale, page.collection.slug), storefront.canonicalUrl).toString() }, ...(page.collection.cover ? { openGraph: { images: [page.collection.cover.url] } } : {}) };
}
export async function renderCollectionPage({ params, searchParams, routeVariant }: Params & Readonly<{ searchParams: Promise<Readonly<Record<string, string | string[] | undefined>>>; routeVariant: StorefrontRouteVariant }>) {
 const selected = await collection((await params).slug, await searchParams);
 const { storefront, design, page, selection } = selected;
 const path = collectionPath(storefront.locale, page.collection.slug);
 if (storefrontRouteVariant(storefront.locale) !== routeVariant) {
  const query = new URLSearchParams();
  if (selection.query) query.set("q", selection.query);
  if (selection.filter !== "all") query.set("filter", selection.filter);
  if (selection.order !== "featured") query.set("sort", selection.order);
  if (selection.offset) query.set("offset", String(selection.offset));
  permanentRedirect(`${path}${query.size ? `?${query}` : ""}`);
 }
 return <StorefrontFrame storefront={storefront} design={design}>
  <nav className="product-breadcrumb store-container" aria-label="İçerik yolu"><Link href="/">Ana sayfa</Link><span aria-hidden="true">/</span><span aria-current="page">{page.collection.name}</span></nav>
  <section className="store-section store-container">
   <header className={styles.hero} data-has-cover={Boolean(page.collection.cover)}>
    {page.collection.cover ? <img className={styles.cover} src={page.collection.cover.url} alt={page.collection.cover.altText} width={page.collection.cover.width} height={page.collection.cover.height} /> : null}
    <div className={styles.intro}><h1>{page.collection.name}</h1>{page.collection.description ? <p>{page.collection.description}</p> : null}</div>
   </header>
   <ProductExplorer products={page.items} preserveOrder selection={selection} total={page.total} nextOffset={page.nextOffset} path={path} locale={storefront.locale} cardStyle={storefront.presentation.theme.productCardStyle} imageRatio={storefront.presentation.theme.productImageRatio} />
  </section>
 </StorefrontFrame>;
}
