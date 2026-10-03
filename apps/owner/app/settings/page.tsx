import { requirePlatformOperator } from "@/lib/platform/auth";
import { SettingsScreen } from "@/components/platform/SettingsScreen";

export const dynamic = "force-dynamic";
export default async function Page() {
  const operator = await requirePlatformOperator();
  return <SettingsScreen operator={{ email: operator.email, label: operator.label, operatorId: operator.operatorId }} />;
}
