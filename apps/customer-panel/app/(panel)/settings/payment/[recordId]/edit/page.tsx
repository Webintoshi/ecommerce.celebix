import { redirect } from "next/navigation";

import { requireServerPanelAccess } from "@/lib/server-access";

const LOWERCASE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export default async function EditPaymentSettingPage({
  params,
}: Readonly<{ params: Promise<{ recordId: string }> }>) {
  const [, { recordId }] = await Promise.all([requireServerPanelAccess(), params]);
  if (LOWERCASE_UUID.test(recordId)) redirect(`/settings/payment?method=${recordId}`);
  redirect("/settings/payment");
}
