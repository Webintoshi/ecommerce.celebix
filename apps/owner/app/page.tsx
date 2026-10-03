import { requirePlatformOperator } from "@/lib/platform/auth";
import { OverviewScreen } from "@/components/platform/OverviewScreen";

export const dynamic = "force-dynamic";
export default async function Page() {
  await requirePlatformOperator();
  return <OverviewScreen />;
}
