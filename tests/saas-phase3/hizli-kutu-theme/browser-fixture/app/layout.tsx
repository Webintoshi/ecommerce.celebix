import "../../../../../apps/storefront-shared/app/globals.css";
import "../../../../../apps/storefront-shared/themes/hizli-kutu/hizli.css";
import { StorefrontNavigationScroll } from "../../../../../apps/storefront-shared/components/StorefrontNavigationScroll";
export const metadata = { title: "Hızlı Kutu — yerel tema kontrolü", robots: { index: false, follow: false } };
export default function Layout({children}:{children:React.ReactNode}) { return <html lang="tr"><body>{children}<StorefrontNavigationScroll /></body></html> }
