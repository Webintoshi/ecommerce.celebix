import { isMerchantActionAllowed } from '@celebix/saas-contracts';
import { CollectionConsole } from '@/components/catalog-collections/CollectionConsole';
import { requireServerPanelAccess } from '@/lib/server-access';
import { resolveCollectionStorefrontOrigin } from '@/lib/server-collections-page';
export default async function CollectionsPage(){const {tenantContext}=await requireServerPanelAccess();const storefrontOrigin=await resolveCollectionStorefrontOrigin(tenantContext);return <CollectionConsole storefrontOrigin={storefrontOrigin} canManage={isMerchantActionAllowed(tenantContext.membership.role,'catalog_admin.manage')}/>;}
