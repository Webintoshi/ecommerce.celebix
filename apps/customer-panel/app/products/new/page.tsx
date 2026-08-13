import { ProductCreateForm } from "@/components/catalog/ProductCreateForm";

export default async function NewProductPage({ searchParams }: Readonly<{ searchParams: Promise<Readonly<{ mode?: string }>> }>) {
  const mode = (await searchParams).mode === "quick" ? "quick" : "advanced";
  return <ProductCreateForm initialMode={mode} />;
}
