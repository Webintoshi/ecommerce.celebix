import { isMerchantActionAllowed } from "@celebix/saas-contracts";
import { ProductReviewConsole } from "@/components/catalog-admin/ProductReviewConsole";
import { requireServerPanelAccess } from "@/lib/server-access";
export default async function ReviewsPage() { const { tenantContext } = await requireServerPanelAccess(); return <ProductReviewConsole canModerate={isMerchantActionAllowed(tenantContext.membership.role, "catalog_admin.moderate")} />; }
