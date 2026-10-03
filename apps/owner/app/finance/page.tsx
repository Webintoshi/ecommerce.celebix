import { requirePlatformOperator } from "@/lib/platform/auth";
import { FinanceScreen } from "@/components/platform/FinanceScreen";

export const dynamic = "force-dynamic";
export default async function Page() {
  await requirePlatformOperator();
  return <FinanceScreen />;
}
