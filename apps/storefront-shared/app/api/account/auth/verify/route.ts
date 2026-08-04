import { defaultAccountRouteDependencies } from "@/lib/account/default-route-dependencies.ts";
import { createAccountAuthVerifyRoute } from "@/lib/account/route.ts";

export const POST = createAccountAuthVerifyRoute(defaultAccountRouteDependencies);
