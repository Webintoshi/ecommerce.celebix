import { defaultAccountRouteDependencies } from "@/lib/account/default-route-dependencies.ts";
import { createAccountAddressDeleteRoute } from "@/lib/account/route.ts";

export const POST = createAccountAddressDeleteRoute(defaultAccountRouteDependencies);
