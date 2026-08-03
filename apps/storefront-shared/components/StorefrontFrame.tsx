import { StorefrontDesignRenderer } from "@celebix/storefront-design-ui";
import type { PublicStorefrontDesign } from "@celebix/saas-contracts";
import type { PublicStorefront } from "../../../packages/saas-contracts/src/storefront/index.ts";
import { Footer } from "./Footer";

export function StorefrontFrame({ storefront, design, now, children, showHomeSurfaces = true }: Readonly<{
  storefront: PublicStorefront;
  design: PublicStorefrontDesign;
  now: Date;
  children: React.ReactNode;
  showHomeSurfaces?: boolean;
}>) {
  return (
    <StorefrontDesignRenderer design={design} storeName={storefront.name} now={now} showHomeSurfaces={showHomeSurfaces}>
      <main>{children}</main>
      <Footer storefront={storefront} />
    </StorefrontDesignRenderer>
  );
}
