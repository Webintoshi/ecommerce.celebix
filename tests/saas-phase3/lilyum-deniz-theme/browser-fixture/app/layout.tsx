import "../../../../../apps/storefront-shared/app/globals.css";
import "../../../../../apps/storefront-shared/themes/lilyum/lilyum.css";
import "../../../../../apps/storefront-shared/themes/lilyum/lilyum-product.css";
import "../../../../../apps/storefront-shared/themes/siora/siora.css";
import "../../../../../apps/storefront-shared/themes/siora/siora-mobile.css";
import "../../../../../apps/storefront-shared/themes/alpler/alpler.css";
import "../../../../../apps/storefront-shared/themes/alpler/alpler-mobile.css";
import "../../../../../apps/storefront-shared/themes/guzide/guzide.css";
import "../../../../../apps/storefront-shared/themes/guzide/guzide-footer.css";
export const metadata = { title: "Lilyum Flora — Yerel tema kontrolü", robots: { index: false, follow: false } };
export default function Layout({ children }: { children: React.ReactNode }) { return <html lang="tr"><body>{children}</body></html>; }
