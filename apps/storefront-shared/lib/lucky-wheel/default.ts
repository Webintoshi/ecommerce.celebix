import "server-only";
import { resolveDefaultPublicStorefrontRuntime } from "../default-runtime.ts";
import { selectTrustedStorefrontHostAuthority } from "../trusted-host-authority.ts";
import { createContactRequestLimiter } from "../engagement/rate-limit.ts";
import { createLuckyWheelRoutes } from "./route.ts";
export const luckyWheelRoutes = createLuckyWheelRoutes({ selectAuthority: selectTrustedStorefrontHostAuthority, resolveRuntime: async () => (await resolveDefaultPublicStorefrontRuntime())?.luckyWheel ?? null, allowSpin: createContactRequestLimiter() });
