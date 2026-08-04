import { defaultAccountRouteDependencies } from "@/lib/account/default-route-dependencies.ts";
import { createAccountProfileUpdateRoute } from "@/lib/account/route.ts";

export const POST = createAccountProfileUpdateRoute(defaultAccountRouteDependencies);
