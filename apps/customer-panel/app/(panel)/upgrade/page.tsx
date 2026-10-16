import {getCommercialPackage,isCommercialCapability}from'@celebix/saas-contracts';
import{redirect}from'next/navigation';
import{CommercialRoleContact,CommercialUpgradeCard}from'@/components/commercial-packages/CommercialUpgradeCard';
import{commercialCapabilityDecision}from'@/lib/commercial-packages/route-model';
import{requireServerPanelAccess}from'@/lib/server-access';
export default async function UpgradePage({searchParams}:Readonly<{searchParams:Promise<Record<string,string|string[]|undefined>>}>){
 const{tenantContext,support}=await requireServerPanelAccess(),query=await searchParams;
 if(!isCommercialCapability(query.feature))redirect('/settings/plan');
 const decision=commercialCapabilityDecision(tenantContext,query.feature);
 if(decision.kind==='allowed')redirect('/settings/plan');
 return <><h1 className="sr-only">Paket seçenekleri</h1>{decision.kind==='role_denied'?<CommercialRoleContact/>:<CommercialUpgradeCard capability={query.feature} currentPackage={getCommercialPackage(tenantContext.entitlements)} currentPlanName={tenantContext.entitlements.planCode} canRequest={tenantContext.membership.role==='store_owner'&&!support}/>}</>;
}
