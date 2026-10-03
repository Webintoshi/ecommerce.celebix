import { requirePlatformOperator } from "@/lib/platform/auth";
import { StoresScreen } from "@/components/platform/StoresScreen";

export const dynamic = "force-dynamic";
export default async function Page() {
  await requirePlatformOperator();
  return <StoresScreen />;
}
