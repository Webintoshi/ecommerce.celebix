import { defaultAccountRouteDependencies } from "@/lib/account/default-route-dependencies.ts";
import { createAccountLogoutAllRoute } from "@/lib/account/route.ts";

export const POST = createAccountLogoutAllRoute(defaultAccountRouteDependencies);
