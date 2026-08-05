# Universal Account Login Soft Palette Design

**Date:** 2026-08-05
**Status:** Approved direction
**Surface:** Shared storefront customer account authentication

## Objective

Keep the approved adaptive split layout and passwordless account flow while making the visual tone calmer, more minimal, and more modern for every current and future storefront.

## Approved Direction

The brand panel uses a pale surface derived from the tenant's published primary color instead of rendering that color at full saturation. The original brand color remains visible through the line motif, focus treatment, confirmation mark, and other small accents.

The primary action changes to a neutral near-black button with white text. This prevents bright tenant colors from dominating the form and guarantees a consistent modern action hierarchy across stores.

Typography becomes quieter without changing the visible copy:

- reduce the desktop brand statement scale;
- reduce the form heading scale slightly;
- preserve the existing mobile line breaks and first-viewport fit;
- keep current store font selection and tenant logo behavior.

## Visual Tokens

- Brand surface: 14% published primary color mixed into a neutral white surface.
- Brand copy: neutral near-black.
- Primary action: `#171717` background with white text.
- Form surface: white.
- Borders: light neutral gray.
- Tenant primary color: accent-only use for motif lines, focus rings, trust mark, and confirmation state.

## Invariants

This revision changes presentation only. It does not change:

- tenant resolution or isolation;
- logo and display-name authority;
- magic-link or six-digit-code behavior;
- form routes, cookies, tickets, return paths, or session handling;
- visible authentication copy;
- guest checkout behavior;
- the desktop split or mobile stacked information architecture.

## Responsive Behavior

Desktop keeps the existing 46/54 split. Mobile keeps the short brand band and places the complete initial form above the fold at 390 × 844 and 320 × 568. No horizontal overflow is permitted.

## Acceptance Criteria

- The Güzide orange no longer appears as a full-saturation large surface.
- Brand identity remains recognizable through a pale tenant-derived surface and accents.
- The CTA has consistent readable contrast independent of tenant color.
- Existing account source and contract tests remain green.
- Production build succeeds.
- Live desktop, 390 px, and 320 px screenshots show no clipping or overflow.
- Real magic-link login, logout, code login, second logout, and guest checkout remain operational.
