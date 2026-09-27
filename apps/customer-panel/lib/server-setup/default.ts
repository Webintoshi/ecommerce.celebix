import "server-only";
import process from "node:process";
import { isMerchantActionAllowed, type TenantContext } from "@celebix/saas-contracts";
import { resolveDefaultServerPanelAccessRuntime } from "../server-panel-access/default.ts";
import { resolveServerCatalogRuntime } from "../server-catalog/runtime.ts";
import { resolveDefaultServerStorefrontDesignRuntime } from "../server-storefront-design/default.ts";
import { resolveDefaultServerStoreDomainRuntime } from "../server-store-domains/default.ts";
import { resolveServerMerchantAdminRuntime } from "../server-merchant-admin/runtime.ts";
import { resolveServerPaymentMethodsRuntime, type ServerPaymentMethodsRuntime } from "../server-payment-methods/runtime.ts";
import { resolveServerProviderExecutionRuntime } from "../server-provider-execution/runtime.ts";
import { CUSTOMER_PANEL_STAGING_AUTH_ENVIRONMENT_FIELDS, parseCustomerPanelStagingAuthConfig, resolveCustomerPanelStagingAuthMode } from "../panel-auth-authority/config.ts";
import { createSetupEdgeProbe } from "./edge-client.ts";
import { createSetupLoader } from "./loader.ts";
import type { SetupPaymentData, SetupPorts } from "./types.ts";
function unavailable():never { throw new Error("setup_read_unavailable"); }
function required<T>(value:T|null):T { return value??unavailable(); }
// The same metadata requirements as payment-method activation, read only.
export function setupAdminPaymentAuthorities(runtime:ServerPaymentMethodsRuntime):SetupPaymentData["authorities"] {
 const authorities:SetupPaymentData["authorities"][number][]=[];
 for(const entry of runtime.catalog){
  try{
   const authority=entry.executionAuthority,environment=entry.readiness==="production_ready"?"live":entry.readiness==="sandbox_ready"?"test":null;
   if(!authority||!environment||authority.environment!==environment||!/^sha256:[a-f0-9]{64}$/.test(authority.evidenceDigest)||runtime.providerExecution===null)continue;
   const descriptor=runtime.providerExecution.registry.get(entry.providerCode,"payment_processing"),packet=runtime.providerExecution.adapters.packet(entry.providerCode),adapter=runtime.providerExecution.adapters.adapter(entry.providerCode);
   if(descriptor?.capability!=="payment_processing"||descriptor.adapterVersion!==authority.adapterVersion||descriptor.environments?.length!==1||descriptor.environments[0]!==environment||descriptor.executionAuthority?.environment!==environment||descriptor.executionAuthority.adapterVersion!==authority.adapterVersion||descriptor.executionAuthority.evidenceDigest!==authority.evidenceDigest||!packet||!adapter||adapter.packet!==packet||packet.providerCode!==entry.providerCode||packet.familyCode!==entry.familyCode||packet.modeCode!==entry.modeCode||packet.adapterVersion!==authority.adapterVersion||!["verification",entry.readiness].includes(packet.readiness[environment])||packet.endpoints[environment].length<1)continue;
   authorities.push(Object.freeze({providerCode:entry.providerCode,environment}));
  }catch{ /* Missing or inconsistent executable metadata cannot imply readiness. */ }
 }
 return Object.freeze(authorities);
}
export const defaultSetupPorts:SetupPorts=Object.freeze({
 async access(context,now){
  if(resolveCustomerPanelStagingAuthMode(process.env)!=="approved_staging")unavailable();
  const auth=parseCustomerPanelStagingAuthConfig(Object.fromEntries(CUSTOMER_PANEL_STAGING_AUTH_ENVIRONMENT_FIELDS.map(name=>[name,process.env[name]])));
  const values=process.env.CELEBIX_ONBOARDING_EDGE_ADDRESSES?.split(",");if(!values)unavailable();
  return createSetupEdgeProbe({platformDomainSuffix:auth.authority.platformDomainSuffix,panelOrigin:auth.authority.panelOrigin,allowedAddresses:values})(context,now);
 },
 async products(context,now){const runtime=required(resolveServerCatalogRuntime(await resolveDefaultServerPanelAccessRuntime()));return runtime.catalog.getDashboardSummary({tenantContext:context,now});},
 async design(context,now){return required(await resolveDefaultServerStorefrontDesignRuntime()).repository.getWorkspace({tenantContext:context,now});},
 async domains(context,now){return required(await resolveDefaultServerStoreDomainRuntime()).domains.list({tenantContext:context,now});},
 async delivery(context,now){return required(resolveServerMerchantAdminRuntime(await resolveDefaultServerPanelAccessRuntime())).merchantAdmin.list({tenantContext:context,now,kind:"shipping_setting"});},
 async payment(context,now){
  const access=await resolveDefaultServerPanelAccessRuntime(),runtime=required(resolveServerPaymentMethodsRuntime(access));
  const methods=await runtime.methods.list({tenantContext:context,now});
  if(methods.some(method=>method.state==="active"&&method.kind!=="provider"))return {methods,profiles:[],authorities:[]};
  const mayReadProfiles=isMerchantActionAllowed(context.membership.role,"integrations.read")&&context.entitlements.features.includes("integrations");
  if(!mayReadProfiles){if(methods.some(method=>method.kind==="provider"))throw Object.assign(new Error("setup_read_restricted"),{code:"membership_denied"});return {methods,profiles:[],authorities:[]};}
  const providers=required(resolveServerProviderExecutionRuntime(access));
  const profiles=await providers.profiles.list({tenantContext:context,now,capability:"payment_processing"});
  // Profiles expose masked public metadata only. No credential, adapter execution
  // or provider HTTP method is called by this checklist.
  return {methods,profiles,authorities:setupAdminPaymentAuthorities(runtime)};
 },
});
export const loadSetupStatus=createSetupLoader(defaultSetupPorts);
