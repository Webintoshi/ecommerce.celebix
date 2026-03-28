import { use } from "react";
import CategoryForm from "@/components/admin/CategoryForm";

interface EditCategoryPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default function EditCategoryPage({ params }: EditCategoryPageProps) {
  const resolvedParams = use(params);
  return <CategoryForm categoryId={resolvedParams.id} />;
}
