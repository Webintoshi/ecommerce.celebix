import "server-only";
import { isMerchantActionAllowed, type MerchantAction, type TenantContext } from "@celebix/saas-contracts";
import { setupStatus } from "../setup-ui/model.ts";
import type { SetupPorts, SetupRead, SetupStatus } from "./types.ts";
export function createSetupLoader(ports: SetupPorts, now: () => Date = () => new Date()) {
  return async (context: TenantContext): Promise<SetupStatus> => {
    const time=now();
    async function read<T>(action: MerchantAction | null, feature: string | null, operation: (context: TenantContext, now: Date) => Promise<T>): Promise<SetupRead<T>> {
      if(context.store.status!=="active" || context.membership.status!=="active" || context.entitlements.status!=="active" || (action && !isMerchantActionAllowed(context.membership.role,action)) || (feature && !context.entitlements.features.includes(feature as never))) return {kind:"restricted"};
      try { return {kind:"value",value:await operation(context,new Date(time))}; }
      catch(error) { const code=error instanceof Error && "code"in error ? error.code : null;return {kind:code==="membership_denied" || code==="feature_not_enabled" ? "restricted":"unavailable"}; }
    }
    const [access,products,design,domains,delivery,payment]=await Promise.all([
      read(null,null,ports.access),read("catalog_admin.read","catalog",ports.products),read("configuration.read","catalog",ports.design),read("configuration.read","custom_domains",ports.domains),read("configuration.read","catalog",ports.delivery),read("configuration.read","catalog",ports.payment),
    ]);
    return setupStatus(context,{access,products,design,domains,delivery,payment});
  };
}
