export const PANEL_ORIGIN = "https://panel.celebix.site";
export const PANEL_OIDC_CALLBACK_URL = "https://panel.celebix.site/auth/callback";
export const PANEL_LOGOUT_REDIRECT = `${PANEL_ORIGIN}/login`;

export const CUSTOMER_PANEL_ORIGIN = PANEL_ORIGIN;
export const CUSTOMER_PANEL_CALLBACK_URL = PANEL_OIDC_CALLBACK_URL;
export const CUSTOMER_PANEL_LOGOUT_REDIRECT = PANEL_LOGOUT_REDIRECT;

/** Phase 1 remains disabled until an explicit integration gate is approved. */
export const CUSTOMER_PANEL_AUTH_ENABLED = false;
