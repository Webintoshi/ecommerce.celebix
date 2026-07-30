import "server-only";

import { resolveDefaultServerAdminHostAuthRuntime } from "./server-admin-host-auth/default.ts";
import { createCrossHostHandoffHttpHandler } from "./cross-host-handoff-http.ts";

export const handleDefaultCrossHostHandoff = createCrossHostHandoffHttpHandler({
  resolveRuntime: resolveDefaultServerAdminHostAuthRuntime,
  clock: () => new Date(),
  maximumBodyBytes: 1_024,
});
