import { defaultAccountRouteDependencies } from "@/lib/account/default-route-dependencies.ts";
import { createAccountLogoutRoute } from "@/lib/account/route.ts";

export const POST = createAccountLogoutRoute(defaultAccountRouteDependencies);
