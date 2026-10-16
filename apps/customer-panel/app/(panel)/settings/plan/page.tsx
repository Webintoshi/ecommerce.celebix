import {isCommercialCapability}from'@celebix/saas-contracts';
import{CommercialPlanComparison}from'@/components/commercial-packages/CommercialPlanComparison';
import{requireServerPanelAccess}from'@/lib/server-access';
export default async function CommercialPlanPage({searchParams}:Readonly<{searchParams:Promise<Record<string,string|string[]|undefined>>}>){
 const{tenantContext,support}=await requireServerPanelAccess(),query=await searchParams,p=tenantContext.entitlements;
 return <CommercialPlanComparison key={`${tenantContext.store.id}:${p.planId}:${p.version}`} currentPlan={{planId:p.planId,planCode:p.planCode,version:p.version}} canRequest={tenantContext.membership.role==='store_owner'&&!support} feature={isCommercialCapability(query.feature)?query.feature:undefined}/>;
}
