import { redirect } from "next/navigation";
import { requirePlatformOperator } from "@/lib/platform/auth";
import { readPlatform } from "@/lib/platform/database";
import { StoreDetailScreen } from "@/components/platform/StoreDetailScreen";

export const dynamic = "force-dynamic";
const uuid = /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i;
export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const operator = await requirePlatformOperator();
  const { slug } = await params;
  if (uuid.test(slug)) return <StoreDetailScreen storeId={slug} />;
  let storeId: string | undefined;
  try {
    const stores = await readPlatform(operator.operatorId, "stores");
    const store = stores.items?.find(store => store.slug === slug);
    if (typeof store?.id === "string" && uuid.test(store.id)) storeId = store.id;
  } catch { /* The list retains its explicit unavailable/retry state. */ }
  redirect(storeId ? `/stores/${encodeURIComponent(storeId)}` : "/stores");
}
