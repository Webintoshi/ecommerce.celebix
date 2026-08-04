import { defaultAccountRouteDependencies } from "@/lib/account/default-route-dependencies.ts";
import { createAccountAuthVerifyBrowserRoute } from "@/lib/account/route.ts";

export const POST = createAccountAuthVerifyBrowserRoute(defaultAccountRouteDependencies);
