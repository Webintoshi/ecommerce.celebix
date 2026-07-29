import { ProductCreateForm } from "@/components/catalog/ProductCreateForm";

export default async function NewProductPage({ searchParams }: Readonly<{ searchParams: Promise<Readonly<{ mode?: string }>> }>) {
  const mode = (await searchParams).mode === "advanced" ? "advanced" : "quick";
  return <ProductCreateForm initialMode={mode} />;
}
