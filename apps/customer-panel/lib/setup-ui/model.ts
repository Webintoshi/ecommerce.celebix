import { getStorefrontDesignPublishIssue, parseBuiltInPaymentMethodConfig, parseMerchantAdminRecord, parseMerchantPaymentMethod, parseMerchantProviderProfile, parseProviderPaymentMethodConfig, parseStorefrontDesignWorkspace, type TenantContext } from "@celebix/saas-contracts";
import { readCheckoutDeliverySettings } from "../checkout-delivery-ui/model.ts";
import type { SetupInputs, SetupItem, SetupRead, SetupStatus } from "../server-setup/types.ts";
const item = (state: SetupItem["state"], code: string): SetupItem => Object.freeze({state,code});
function fromRead<T>(read: SetupRead<T>, evaluate: (value: T) => SetupItem): SetupItem {
  if(read.kind !== "value") return item(read.kind,"read_"+read.kind);
  try { return evaluate(read.value); } catch { return item("unavailable","read_unavailable"); }
}
export function setupStatus(context: TenantContext, input: SetupInputs): SetupStatus {
  const access = fromRead(input.access, proof => proof.schemaVersion===1 && proof.storeId===context.store.id && context.store.status==="active" && context.membership.status==="active" && [context.store.slug+".saas-staging.celebix.net",context.store.slug+".saas-staging.celebix.site"].includes(proof.hostname) && proof.adminHostname===context.store.slug+".admin."+proof.hostname.slice(context.store.slug.length+1) ? item("ready","access_ready") : item("unavailable","read_unavailable"));
  const products = fromRead(input.products, value => {
    if(!Number.isSafeInteger(value.activeProducts)||value.activeProducts<0) throw new Error("invalid");
    return value.activeProducts>0 ? item("ready","products_ready") : item("action_required","products_missing");
  });
  const design = fromRead(input.design, value => {
    const workspace = parseStorefrontDesignWorkspace(value);
    if(workspace.publishedVersion<1 || workspace.published.publicationVersion!==workspace.publishedVersion) return item("action_required","design_unpublished");
    if(workspace.publishedDraft && getStorefrontDesignPublishIssue(workspace.publishedDraft)) return item("action_required","design_unpublished");
    const changed = workspace.publishedDraft ? JSON.stringify(workspace.draft)!==JSON.stringify(workspace.publishedDraft) : Date.parse(workspace.draftUpdatedAt)>Date.parse(workspace.publishedAt);
    return Object.freeze({...item("ready","design_ready"),...(changed ? {recommendation:"unpublished_changes"as const} : workspace.published.brand.logo===null ? {recommendation:"optional_logo"as const} : {})});
  });
  const domains = fromRead(input.domains, rows => {
    const primary = rows.filter(row=>row.primary);
    if(primary.length>1) throw new Error("invalid");
    return primary[0]?.status==="active" && primary[0].uiStatus==="active" && primary[0].verifiedAt!==null ? item("ready","domains_ready") : item("action_required","domains_missing");
  });
  const delivery = fromRead(input.delivery, rows => {
    const records = rows.map(parseMerchantAdminRecord);
    if(records.some(record=>record.kind!=="shipping_setting")) throw new Error("invalid");
    const latest = records.filter(record=>record.status==="active").sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)||b.id.localeCompare(a.id))[0];
    if(!latest&&records.length>=200) return item("unavailable","read_unavailable");
    const settings = latest ? readCheckoutDeliverySettings(latest.config) : null;
    return settings===null ? item("action_required","delivery_missing") : item("ready",settings.shippingPriceCents===0?"delivery_free":"delivery_ready");
  });
  let payment: SetupStatus["payment"];
  if(input.payment.kind!=="value") payment=Object.freeze({...item(input.payment.kind,"read_"+input.payment.kind),kind:"unavailable"});
  else try {
    const value=input.payment.value,methods=value.methods.map(parseMerchantPaymentMethod),profiles=value.profiles.map(parseMerchantProviderProfile);
    const active=methods.filter(method=>method.state==="active");
    const offline=active.find(method=>method.kind!=="provider" && (parseBuiltInPaymentMethodConfig(method.kind,method.config),true));
    if(offline) payment=Object.freeze({...item("ready","payment_offline"),kind:"offline"});
    else if(active.some(method=>method.kind==="provider") && (input.access.kind!=="value" || access.state!=="ready" || input.access.value.payment.kind==="unavailable")) payment=Object.freeze({...item("unavailable","read_unavailable"),kind:"unavailable"});
    else {
      const available=input.access.kind==="value" && access.state==="ready" && input.access.value.payment.kind==="ready" ? input.access.value.payment.providers : [];
      const matched=active.filter(method=>{
        if(method.kind!=="provider" || (method.providerCode!=="paytr_iframe" && method.providerCode!=="iyzico_iframe")) return false;
        const preferences=parseProviderPaymentMethodConfig(method.providerCode,method.config),profile=profiles.find(candidate=>candidate.id===method.profileId);
        return profile?.status==="active" && profile.capability==="payment_processing" && profile.providerCode===method.providerCode && profile.credentialVersion>0 && profile.lastValidatedAt!==null && profile.publicConfig.environment===preferences.environment
          && value.authorities.some(authority=>authority.providerCode===method.providerCode && authority.environment===preferences.environment)
          && available.some(authority=>authority.providerCode===method.providerCode && authority.environment===preferences.environment);
      });
      const live=matched.some(method=>method.config.environment==="live"),testing=matched.some(method=>method.config.environment==="test");
      payment=live ? Object.freeze({...item("ready","payment_live"),kind:"live"}) : testing ? Object.freeze({...item("action_required","payment_test"),kind:"test"}) : Object.freeze({...item("action_required",methods.length||profiles.length?"payment_configured":"payment_missing"),kind:methods.length||profiles.length?"configured":"none"});
    }
  } catch { payment=Object.freeze({...item("unavailable","read_unavailable"),kind:"unavailable"}); }
  return Object.freeze({access,products,design,domains,delivery,payment});
}
