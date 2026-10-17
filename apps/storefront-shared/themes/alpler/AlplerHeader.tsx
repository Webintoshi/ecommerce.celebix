import type { PublicStorefront, PublicStorefrontDesign } from "@celebix/saas-contracts";
import { StoreUtilities } from "../../components/StoreUtilities";
import { SioraMobileShell } from "../siora/SioraMobileShell";
import { AlplerHeaderPresentation } from "./AlplerHeaderPresentation";

export function AlplerHeader({ storefront, design }: Readonly<{ storefront: PublicStorefront; design: PublicStorefrontDesign }>) {
 return <AlplerHeaderPresentation storefront={storefront} design={design} utilities={<StoreUtilities />} mobileMenu={<SioraMobileShell storefrontId={storefront.id} locale={storefront.locale} displayName={storefront.presentation.displayName} navigation={storefront.presentation.schemaVersion === 1 ? { items: [] } : storefront.presentation.navigation} variant="sports" />} />;
}
