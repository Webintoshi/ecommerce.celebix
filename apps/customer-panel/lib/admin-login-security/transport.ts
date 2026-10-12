import { createAdminLoginInternalTransport } from "../../../../packages/saas-data/src/admin-login-security/internal.ts";
import type { AdminSecurityInternalTransport } from "./handler.ts";
export function createAdminLoginSecurityTransport(options: Parameters<typeof createAdminLoginInternalTransport>[0]):AdminSecurityInternalTransport {
 const internal=createAdminLoginInternalTransport(options);
 return Object.freeze({execute:input=>internal.command(input)});
}
