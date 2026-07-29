import { redirect } from "next/navigation";

import { requireServerPanelAccess } from "@/lib/server-access";

export default async function NewPaymentSettingPage() {
  await requireServerPanelAccess();
  redirect("/settings/payment?dialog=provider-catalog");
}
