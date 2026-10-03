import { requirePlatformOperator } from "@/lib/platform/auth";
import { PlansScreen } from "@/components/platform/PlansScreen";

export const dynamic = "force-dynamic";
export default async function Page() {
  await requirePlatformOperator();
  return <PlansScreen />;
}
