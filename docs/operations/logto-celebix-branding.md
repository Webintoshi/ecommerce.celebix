# Logto Celebix Branding Runbook

## Scope

This runbook applies the reviewed Celebix theme to the shared staging Logto omni sign-in experience. It changes presentation only.

It does not change the Logto container image, database schema, application definitions, callbacks, sign-in methods, registration policy, credential policy, OIDC configuration, cookies, sessions, or logout behavior.

## Source of truth

- Custom CSS: `branding/logto/celebix-auth-theme.css`
- Company logo: `apps/customer-panel/public/Logo/celebix-koyu-logo.svg`
- Light brand color: `#FE6100`
- Experience mode: light
- Logto signature: hidden
- Configuration level: omni sign-in experience

The repository CSS must be applied verbatim. Do not maintain a second handwritten copy in an operator notebook.

## Pre-change checks

1. Confirm the target is the staging authentication host and that the public health/sign-in endpoint responds.
2. Read the current omni sign-in-experience branding values through an authenticated Logto Console or Management API session.
3. Keep the previous logo, favicon, brand color, mode, branding-visibility flag, and custom CSS together as one rollback set.
4. Keep the rollback set in memory or an access-controlled temporary location. Do not print it, paste it into chat, add it to command history, or commit it.
5. Confirm the target application currently inherits the omni experience and does not have a higher-precedence application or organization override.

## Apply

Use Logto Console at **Sign-in & account → Branding**, or the equivalent authenticated Management API fields.

1. Set the light company logo to the existing Celebix dark SVG.
2. Use an existing approved square Celebix favicon when available. Do not synthesize or upload an unrelated mark during this operation.
3. Set the light brand color to `#FE6100`.
4. Keep the experience in light mode.
5. Enable the supported setting that hides the Logto signature.
6. Set omni `customCss` to the exact UTF-8 contents of `branding/logto/celebix-auth-theme.css`.
7. Save once after all presentation fields are staged.

When using the Management API, patch only the presentation fields read during the pre-change step. Never construct a replacement payload from defaults and never change unrelated sign-in-experience fields.

## Validation

Validate without submitting real credentials:

1. Open the target application's direct sign-in page in a fresh browser page.
2. Confirm the Celebix wordmark, orange primary action, neutral canvas, compact form surface, visible focus, and absence of the Logto signature.
3. Follow the public registration link and confirm the same theme.
4. Check a narrow mobile viewport and a compact-height desktop viewport for overflow or clipped actions.
5. Start the existing tenant-admin login route and confirm it still reaches the same Logto authorization experience.

Record only public URLs, timestamp, viewport class, visible DOM observations, and PASS/FAIL results. Do not record cookies, authorization query values, state, nonce, PKCE material, user input, account data, access tokens, passwords, API keys, client secrets, or raw configuration exports.

## Rollback

Rollback is configuration-only:

1. Restore the previous company logo, favicon, brand color, mode, branding-visibility flag, and custom CSS as the single captured rollback set.
2. Save once.
3. Open a fresh sign-in page and confirm the previous presentation is restored.
4. Re-run the tenant-admin redirect check to confirm authentication behavior remains unchanged.

No application redeploy, database migration, callback edit, or container restart is required for either apply or rollback.
