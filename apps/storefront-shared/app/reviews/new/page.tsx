import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProductReviewForm } from "../../../components/ProductReviewForm";
import { resolveStorefrontPage } from "../../../lib/page-context";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Ürün deneyiminizi paylaşın", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default async function ReviewPage() { const page = await resolveStorefrontPage(); if (page.kind !== "active") notFound(); return <ProductReviewForm storeName={page.context.storefront.name} />; }
