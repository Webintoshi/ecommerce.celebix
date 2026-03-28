import { use } from "react";
import CustomerForm from "@/components/admin/CustomerForm";

interface EditCustomerPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default function EditCustomerPage({ params }: EditCustomerPageProps) {
  const resolvedParams = use(params);
  return <CustomerForm customerId={resolvedParams.id} />;
}
