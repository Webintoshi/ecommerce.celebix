import type { PublicProduct, PublicStarterHomeSection, PublicStarterThemePresentationV2, PublicStarterThemePresentationV3, PublicStarterThemePresentationV4 } from "@celebix/saas-contracts";
import { ProductGrid } from "./ProductGrid";
import { CampaignProductRowFrame } from "./CampaignProductRowFrame";
import type { GuzideVisualTheme } from "../themes/guzide/theme.ts";

type ProductRowSection = Extract<PublicStarterHomeSection, { kind: "product_row" }>;

export function CampaignProductRow({ section, products, presentation, locale, visualTheme }: Readonly<{
  section: ProductRowSection;
  products: readonly PublicProduct[];
  presentation: PublicStarterThemePresentationV2 | PublicStarterThemePresentationV3 | PublicStarterThemePresentationV4;
  locale: string;
  visualTheme?: GuzideVisualTheme;
}>) {
  return <CampaignProductRowFrame section={section} products={products} locale={locale} visualTheme={visualTheme} renderProductGrid={() => <ProductGrid products={products} preserveOrder={section.source === "category" || section.source === "manual"} locale={locale} cardStyle={presentation.visual.productCardStyle} imageRatio={presentation.visual.productImageRatio} />} />;
}
