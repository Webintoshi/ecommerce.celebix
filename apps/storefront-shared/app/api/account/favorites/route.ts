import { defaultAccountRouteDependencies } from "@/lib/account/default-route-dependencies.ts";
import { createAccountFavoriteRoute } from "@/lib/account/route.ts";

export const POST = createAccountFavoriteRoute(defaultAccountRouteDependencies);
