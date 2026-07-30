# Celebix Logto Branding Design

**Date:** 2026-07-30  
**Status:** Approved design, pending implementation review  
**Target:** Celebix SaaS staging Logto sign-in experience

## Objective

Replace the default purple Logto presentation with a responsive, minimal Celebix experience without changing OIDC, session, credential, callback, registration, password-reset, or verification behavior.

The theme applies at the Logto omni sign-in-experience level so the same Celebix language covers sign-in, registration, password recovery, verification, loading, and error screens. The application identified by `1n93icpphr11h4fmrup9w` must inherit this experience.

## Visual direction

- Use the existing dark Celebix wordmark with its orange accent as the primary logo.
- Use Celebix orange `#FE6100` for primary actions, links, focus rings, and selected states.
- Use `#D95200` for hover/pressed emphasis, `#2B2B2B` for primary text, and `#F4F4F8` for the page canvas.
- Replace the oversized default card with a compact, calm authentication surface sized for the form content.
- Keep generous whitespace, restrained shadows, 12–16px radii, and readable 48–52px controls.
- Prefer the Celebix product font stack (`Plus Jakarta Sans`, `Segoe UI`, system sans-serif) without introducing a third-party runtime dependency.
- Remove the visible Logto logo and “Powered by Logto” signature through supported branding controls; CSS is a defensive presentation fallback only.
- Do not add marketing illustrations, video, animated backgrounds, or a split-screen promotional panel.

## Responsive behavior

### Desktop and tablet

- Center a single form surface with a maximum width of approximately 460px.
- Keep the form vertically balanced rather than stretching the white surface to most of the viewport.
- Use a subtle orange radial accent in the neutral page background without reducing contrast.

### Mobile

- Use a full-width layout with 20–24px horizontal spacing.
- Remove heavy elevation and outer card framing on narrow screens.
- Preserve minimum 48px touch targets and prevent horizontal overflow.
- Respect safe-area insets and compact viewport heights.

## Logto configuration strategy

Use Logto's supported sign-in-experience settings instead of modifying the Logto container image:

1. Set the company logo and favicon through Logto branding settings.
2. Set the light-mode brand color to `#FE6100` and keep the experience in light mode for visual consistency.
3. Enable the supported “Hide Logto branding” option.
4. Apply omni-level custom CSS so every Celebix authentication flow receives the same theme.
5. Target Logto CSS-module elements with stable structural and partial-class selectors scoped under `#app`; avoid assumptions about generated hashes.

Application-specific or organization-specific CSS is intentionally not used for this change. A later tenant-branding feature may override omni branding through Logto's documented precedence model, but the secure Celebix fallback must remain intact.

## Security and behavior boundaries

- Do not alter form fields, credential rules, sign-in methods, registration policy, callback URIs, OIDC parameters, cookies, sessions, or logout behavior.
- Do not inject JavaScript or custom HTML.
- Do not expose credentials, tokens, tenant identifiers, or operational metadata in CSS, URLs, assets, logs, or documentation.
- Serve branding assets from a controlled Celebix HTTPS origin or upload them directly through Logto's branding controls.
- Keep keyboard navigation, visible focus, native validation, loading, disabled, error, and high-contrast states usable.

## Validation

After applying the branding, verify the real staging experience for:

1. direct sign-in presentation for the target application;
2. registration navigation and presentation;
3. invalid credential/error presentation without submitting or logging real secrets;
4. responsive desktop and mobile layouts;
5. logo, favicon, orange action states, focus visibility, and absence of Logto branding;
6. unchanged OIDC redirect/callback behavior through the existing tenant-admin flow.

## Rollback

Before mutation, record the current Logto sign-in-experience branding values. Rollback restores the previous logo, favicon, brand color, branding-visibility flag, and `customCss` value as one configuration set. No application deployment or database migration is required.

## Acceptance criteria

- No purple Logto branding remains on the user-facing Celebix authentication screens.
- The Celebix logo, colors, typography, spacing, controls, focus states, and mobile layout render consistently across the supported flows.
- Authentication behavior and security boundaries remain unchanged.
- The target staging application opens the branded experience and the existing tenant login redirect still reaches it successfully.
