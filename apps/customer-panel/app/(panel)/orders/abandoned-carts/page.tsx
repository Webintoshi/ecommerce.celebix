import { AbandonedCartConsole } from "@/components/orders/AbandonedCartConsole";
import { requireServerPanelAccess } from "@/lib/server-access";

export const dynamic = "force-dynamic";
export default async function AbandonedCartsPage() { const access = await requireServerPanelAccess(); return <><AbandonedCartConsole /></>; }
