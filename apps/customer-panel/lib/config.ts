import { PANEL_OIDC_CALLBACK_URL } from "../../../packages/platform-config/src/saas.ts";

export const PANEL_ORIGIN = new URL(PANEL_OIDC_CALLBACK_URL).origin;
export const PANEL_LOGOUT_REDIRECT = `${PANEL_ORIGIN}/login`;

export { PANEL_OIDC_CALLBACK_URL };

export const CUSTOMER_PANEL_ORIGIN = PANEL_ORIGIN;
export const CUSTOMER_PANEL_CALLBACK_URL = PANEL_OIDC_CALLBACK_URL;
export const CUSTOMER_PANEL_LOGOUT_REDIRECT = PANEL_LOGOUT_REDIRECT;

/** Phase 1 remains disabled until an explicit integration gate is approved. */
export const CUSTOMER_PANEL_AUTH_ENABLED = false;
