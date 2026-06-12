import { QuickOrderCheckoutPage } from "@/components/checkout/QuickOrderCheckoutPage";

export default async function QuickOrderPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <QuickOrderCheckoutPage token={token} />;
}
