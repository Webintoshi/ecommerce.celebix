import { defaultAccountRouteDependencies } from "@/lib/account/default-route-dependencies.ts";
import { createAccountDeviceRevokeRoute } from "@/lib/account/route.ts";

export const POST = createAccountDeviceRevokeRoute(defaultAccountRouteDependencies);
