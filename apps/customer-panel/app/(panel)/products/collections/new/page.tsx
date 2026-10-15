import { isMerchantActionAllowed } from '@celebix/saas-contracts';
import { CollectionEditor } from '@/components/catalog-collections/CollectionEditor';
import { requireServerPanelAccess } from '@/lib/server-access';
import { resolveCollectionStorefrontOrigin } from '@/lib/server-collections-page';
export default async function NewCollectionPage(){const {tenantContext}=await requireServerPanelAccess();const storefrontOrigin=await resolveCollectionStorefrontOrigin(tenantContext);return <CollectionEditor storefrontOrigin={storefrontOrigin} canManage={isMerchantActionAllowed(tenantContext.membership.role,'catalog_admin.manage')}/>;}
