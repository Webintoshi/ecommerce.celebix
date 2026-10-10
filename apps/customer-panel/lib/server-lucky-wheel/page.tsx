import {isMerchantActionAllowed} from '@celebix/saas-contracts';
import {LuckyWheelStudio} from '@/components/promotions/LuckyWheelStudio';
import {requireServerPanelAccess} from '@/lib/server-access';
import {requirePromotionPageContext} from '@/lib/server-promotion-page';
export async function renderLuckyWheelPage(entry:{initialCreate?:boolean;campaignId?:string}={}){
 const [{tenantContext},{timezone}]=await Promise.all([requireServerPanelAccess(),requirePromotionPageContext()]);const role=tenantContext.membership.role;
 return <LuckyWheelStudio {...entry} timezone={timezone} canManage={isMerchantActionAllowed(role,'promotions.manage_draft')} canEnable={isMerchantActionAllowed(role,'promotions.publish')} canReadCoupons={isMerchantActionAllowed(role,'promotions.read')} canCreateCoupon={isMerchantActionAllowed(role,'promotions.manage_draft')&&isMerchantActionAllowed(role,'promotions.publish')} canDelete={isMerchantActionAllowed(role,'promotions.archive')} canRevoke={isMerchantActionAllowed(role,'promotions.publish')}/>;
}
