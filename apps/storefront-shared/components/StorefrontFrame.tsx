import type { PublicStorefront } from "../../../packages/saas-contracts/src/storefront/index.ts";
import { Footer } from "./Footer";
import { Header } from "./Header";

export function StorefrontFrame({ storefront, children }: { storefront: PublicStorefront; children: React.ReactNode }) { return <><Header storefront={storefront} /><main>{children}</main><Footer storefront={storefront} /></>; }
