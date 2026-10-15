import { requireServerPanelAccess } from "@/lib/server-access";
import { permanentRedirect } from "next/navigation";

export default async function NewPolicyPage() {
  await requireServerPanelAccess();
  permanentRedirect("/content/policies");
}
