import { defaultAccountRouteDependencies } from "@/lib/account/default-route-dependencies.ts";
import { createAccountSessionRoute } from "@/lib/account/route.ts";

export const GET = createAccountSessionRoute(defaultAccountRouteDependencies);
