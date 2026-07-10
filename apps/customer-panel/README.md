# Celebix Customer Panel — Phase 1

This workspace is a provider-neutral, fail-closed customer-panel foundation. It does not configure or call Logto, create a database, access infrastructure, or enable live self-serve store creation.

## Future production gate

Production activation requires a separate explicit approval and integration change that provides:

- one shared OIDC application for `panel.celebix.site`;
- the exact callback URL `https://panel.celebix.site/auth/callback`;
- Authorization Code flow with PKCE S256, opaque one-time state, and nonce;
- a server-side client/BFF that verifies issuer, audience, signature/JWKS, expiry, and nonce;
- a persistent server-side authorization-transaction store and panel-session store;
- an HttpOnly, production-Secure, SameSite=Lax, Path=/ cookie with bounded lifetime and rotation after login and active-store changes;
- the exact logout redirect allowlist containing `https://panel.celebix.site/login`;
- membership and active-store revalidation on every tenant-aware request.

There must be no per-store Logto application, no provider token exposed to React, and no access, refresh, ID, session, or handoff token in a cross-domain URL, query string, fragment, log, error, or `TenantContext`.
