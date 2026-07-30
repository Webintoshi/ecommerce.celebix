# Celebix Logto Branding Verification

**Verified:** 2026-07-30 15:30 UTC  
**Environment:** Celebix SaaS staging  
**Result:** PASS

## Applied configuration

- Target Logto tenant and experience: `default / default`
- Primary brand color: `#FE6100`
- Dark-mode experience: disabled
- Logto signature: hidden
- Company logo: controlled Celebix HTTPS SVG asset
- Custom CSS: 6,637 UTF-8 bytes from repository commit `99feaf1d`
- Rollback point: captured before mutation in the PostgreSQL container with owner-only temporary-file permissions
- One-off Coolify task: disabled after verification

No sign-in method, registration policy, credential rule, callback, OIDC parameter, cookie, session, tenant membership, or logout setting was changed.

## Browser evidence

### Direct sign-in

- Public entry: `https://auth.saas-staging.celebix.site/sign-in`
- Target application parameter was accepted and the browser reached the Logto sign-in experience.
- Celebix wordmark rendered at the reviewed size.
- Primary action and links rendered in Celebix orange.
- Neutral canvas, compact authentication surface, fields, typography, spacing, and shadow matched the approved minimal direction.
- “Powered by Logto” was absent from the accessibility tree and visible page.
- Turkish sign-in content and the registration navigation remained available.

### Registration

- Public entry: `https://auth.saas-staging.celebix.site/register`
- The public “Hesap Oluştur” navigation opened the themed registration experience.
- Celebix logo, orange action, compact form, Turkish content, and return-to-sign-in link rendered consistently.
- No credential or account data was entered or submitted.

### Tenant-admin redirect

- Güzide canonical admin login returned HTTP 200.
- The shared panel login endpoint returned HTTP 303 to the expected Logto `/oidc/auth` endpoint.
- Following “Güvenli giriş yap” in the browser reached the same themed Logto sign-in page.
- No browser console errors were observed on the registration page or tenant redirect destination.

### Responsive contract

- Desktop visual verification passed at the active Chrome viewport.
- The source-controlled contract test verifies the `600px` mobile breakpoint, full-width mobile surface, safe-area padding, minimum 48px controls, compact-height layout, reduced-motion handling, and forced-colors focus treatment.
- The Chrome extension session did not expose a viewport override, so no synthetic mobile screenshot was produced in this run.

## HTTP evidence

- Direct sign-in and registration entry routes returned redirects that resolved successfully in Chrome to their experience pages.
- Güzide canonical admin login returned HTTP 200.
- Shared panel login returned HTTP 303 to `https://auth.saas-staging.celebix.site/oidc/auth`; authorization query values were intentionally not recorded.

## Operational notes

One initial color update command was rejected before changing the target row because of shell/JSON quoting. The operation was replaced with a `jsonb_build_object` update, completed successfully, and the final database read confirmed `#FE6100`, light mode, hidden Logto branding, the Celebix logo URL, and the expected custom CSS length.

The live sign-in page was left open in Chrome for user inspection.
