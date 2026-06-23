import { ProductDefinitionsHubPage } from "@/components/admin/products-module-phase-one";
import { STORE_RUNTIME } from "@/lib/store-runtime";

export const metadata = {
  title: `Tanımlamalar | ${STORE_RUNTIME.name} Admin`,
  description: "Katalog veri sözlüğü ve hazırlık modülleri.",
};

export default function ProductDefinitionsPage() {
  return <ProductDefinitionsHubPage />;
}
