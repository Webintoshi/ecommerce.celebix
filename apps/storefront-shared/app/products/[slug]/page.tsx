import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { PublicStorefrontRepositoryError } from "@celebix/saas-data";
import type {
  PublicPolicyPage,
  StarterProductDetailConfigV2,
  StorefrontPolicyKey,
} from "@celebix/saas-contracts";
import { ProductDetailExperience } from "@/components/ProductDetailExperience";
import { StorefrontAnalyticsEvent } from "@/components/StorefrontAnalyticsEvent";
import { StorefrontFrame } from "@/components/StorefrontFrame";
import { productViewEvent } from "@/lib/analytics/events.ts";
import { resolveStorefrontPage } from "@/lib/page-context.ts";
import { requireStorefrontPage } from "@/lib/page-resolution.ts";
import { buildPublicPolicyPage } from "@/lib/policy-page.ts";
import {
  productPath,
  storefrontRouteVariant,
  type StorefrontRouteVariant,
} from "@/lib/storefront-routes.ts";

const LEGACY_PRODUCT_DETAIL: StarterProductDetailConfigV2 = Object.freeze({
  galleryStyle: "grid",
  showSku: true,
  showBrand: true,
  showBreadcrumbs: true,
  showRelatedProducts: true,
  showApprovedReviews: true,
  mobileStickyPurchase: true,
  showSizeGuide: true,
  informationSections: Object.freeze([
    "description",
    "materials_and_care",
    "certifications",
    "shipping_and_returns",
  ] as const),
});
const PRODUCT_POLICY_KEYS = Object.freeze([
  "payment_delivery",
  "returns_exchanges",
] as const satisfies readonly StorefrontPolicyKey[]);

async function product(slug: string) {
  const { runtime, storefront, campaign, design, tracker } = requireStorefrontPage(
    await resolveStorefrontPage(),
  );
  try {
    return {
      runtime,
      storefront,
      campaign,
      design,
      tracker,
      product: await runtime.repository.getPublicProductBySlug({
        storefront,
        now: new Date(),
        slug,
      }),
    };
  } catch (error) {
    if (
      error instanceof PublicStorefrontRepositoryError &&
      error.code === "not_found"
    )
      notFound();
    throw error;
  }
}
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const selected = await product((await params).slug);
  const { presentation } = selected.storefront;
  return {
    title: `${selected.product.title} | ${presentation.displayName}`,
    description:
      selected.product.description ??
      `${selected.product.title} ürün ayrıntıları`,
    robots: {
      index: presentation.seo.allowIndex,
      follow: presentation.seo.allowIndex,
    },
    alternates: {
      canonical: new URL(
        productPath(selected.storefront.locale, selected.product.slug),
        selected.storefront.canonicalUrl,
      ).toString(),
    },
    openGraph: {
      title: selected.product.title,
      type: "website",
      images: selected.product.media[0]?.url
        ? [selected.product.media[0].url]
        : [],
    },
  };
}
export async function renderProductPage({
  params,
  routeVariant,
}: {
  params: Promise<{ slug: string }>;
  routeVariant: StorefrontRouteVariant;
}) {
  const selected = await product((await params).slug);
  const { storefront, product: item } = selected;
  if (storefrontRouteVariant(storefront.locale) !== routeVariant) {
    permanentRedirect(productPath(storefront.locale, item.slug));
  }
  const presentation =
    selected.campaign?.presentation ?? storefront.presentation;
  const options: StarterProductDetailConfigV2 =
    presentation.schemaVersion === 3
      ? presentation.productDetail
      : presentation.schemaVersion === 2
        ? Object.freeze({
            ...LEGACY_PRODUCT_DETAIL,
            ...presentation.productDetail,
          })
        : LEGACY_PRODUCT_DETAIL;
  const [relatedProducts, publishedPolicies] = await Promise.all([
    options.showRelatedProducts &&
    selected.runtime.repository.listRelatedPublicProducts
      ? selected.runtime.repository
          .listRelatedPublicProducts({
            storefront,
            now: new Date(),
            productSlug: item.slug,
            limit: 4,
          })
          .then(({ items }) => items)
          .catch(() => [])
      : Promise.resolve([]),
    options.informationSections.includes("shipping_and_returns")
      ? Promise.all(
          PRODUCT_POLICY_KEYS.map(async (key) => {
            try {
              const policy = buildPublicPolicyPage(
                await selected.runtime.content.getPolicy({
                  hostname: storefront.hostname,
                  now: new Date(),
                  key,
                }),
              );
              return policy.published ? policy : null;
            } catch {
              return null;
            }
          }),
        ).then((policies) =>
          policies.filter(
            (policy): policy is PublicPolicyPage => policy !== null,
          ),
        )
      : Promise.resolve([]),
  ]);
  return (
    <StorefrontFrame storefront={storefront} design={selected.design}>
      <StorefrontAnalyticsEvent
        tracker={selected.tracker}
        event={productViewEvent(item.id, item.variants.find(({ available }) => available)?.id, item.primaryCategoryId, item.currency, item.priceCents)}
        trigger="mount"
      />
      <ProductDetailExperience product={item}
        locale={storefront.locale}
        relatedProducts={relatedProducts}
        publishedPolicies={publishedPolicies}
        options={options}
        cardStyle={presentation.theme.productCardStyle}
        imageRatio={presentation.theme.productImageRatio}
        showQuantitySelector={presentation.schemaVersion === 2 || presentation.schemaVersion === 3 ? presentation.cart.showQuantitySelector : true}
      />
    </StorefrontFrame>
  );
}

export default function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  return renderProductPage({ params, routeVariant: "legacy" });
}
