import { createPanelLogoutHandler } from "../../../lib/logout.ts";
import { DisabledPanelSessionStore } from "../../../lib/session.ts";

export const POST = createPanelLogoutHandler({
  enabled: false,
  sessionStore: new DisabledPanelSessionStore(),
  cookiePolicy: { kind: "production" },
});
