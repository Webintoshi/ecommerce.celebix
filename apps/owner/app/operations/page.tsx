import { requirePlatformOperator } from "@/lib/platform/auth";
import { OperationsScreen } from "@/components/platform/OperationsScreen";

export const dynamic = "force-dynamic";
export default async function Page() {
  await requirePlatformOperator();
  return <OperationsScreen />;
}
