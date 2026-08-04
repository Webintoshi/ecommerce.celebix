import { defaultAccountRouteDependencies } from "@/lib/account/default-route-dependencies.ts";
import { createAccountAuthStartRoute } from "@/lib/account/route.ts";

export const POST = createAccountAuthStartRoute(defaultAccountRouteDependencies);
