import { isMerchantActionAllowed } from '@celebix/saas-contracts';
import { redirect } from 'next/navigation';
import { PopupStudio } from '@/components/promotions/PopupStudio';
import { requireServerPanelAccess } from '@/lib/server-access';
import { requirePromotionPageContext } from '@/lib/server-promotion-page';
export default async function PopupsPage() {
    const { tenantContext } = await requireServerPanelAccess();
    const role = tenantContext.membership.role;
    if (!isMerchantActionAllowed(role, 'configuration.read'))
        redirect('/unauthorized');
    const canReadCoupons = isMerchantActionAllowed(role, 'promotions.read');
    const promotionContext = canReadCoupons ? await requirePromotionPageContext() : null;
    return <PopupStudio canManage={isMerchantActionAllowed(role, 'configuration.manage')} canReadCoupons={canReadCoupons} canCreateCoupon={Boolean(promotionContext?.canManage && promotionContext?.canPublish)} timezone={promotionContext?.timezone}/>;
}
