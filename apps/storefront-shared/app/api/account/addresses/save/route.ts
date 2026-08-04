import { defaultAccountRouteDependencies } from "@/lib/account/default-route-dependencies.ts";
import { createAccountAddressSaveRoute } from "@/lib/account/route.ts";

export const POST = createAccountAddressSaveRoute(defaultAccountRouteDependencies);
