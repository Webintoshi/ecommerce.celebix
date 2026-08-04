import { defaultAccountRouteDependencies } from "@/lib/account/default-route-dependencies.ts";
import { createAccountProfileCompleteRoute } from "@/lib/account/route.ts";

export const POST = createAccountProfileCompleteRoute(defaultAccountRouteDependencies);
