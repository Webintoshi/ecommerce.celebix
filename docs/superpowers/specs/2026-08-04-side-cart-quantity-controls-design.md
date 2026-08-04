# Side Cart Quantity Controls Design

Status: Kullanıcı tarafından yazılı olarak onaylandı

Date: 2026-08-04

## Goal

Make the starter storefront side cart modern and minimal, repair its quantity mutation behavior, and let each merchant publish whether the side-cart quantity selector is visible. The setting must remain part of the durable, tenant-scoped storefront design authority.

## Scope

- Refine the existing `SideCartDrawer` presentation without creating a second cart implementation.
- Add `cart.showQuantitySelector` to the versioned starter-theme composition and public presentation contracts.
- Default the setting to `true` so existing and newly initialized stores preserve quantity controls.
- Add a customer-panel design control named `Miktar seçiciyi göster` under `Sepet deneyimi`.
- When enabled, render accessible decrement and increment controls in the side cart.
- When disabled, omit the controls and render the canonical quantity as read-only `<n> adet` text.
- Keep the full cart page quantity editor unchanged.
- Preserve existing checkout-readiness, trust-message, cart-cookie, host-authority, replay, optimistic-version, and fail-closed behavior.

## Authority and Data Flow

The merchant edits the draft composition in the existing customer-panel storefront-design workspace. Draft save and publish continue through the current design HTTP and PostgreSQL repository boundaries. The published composition becomes the only source for `showQuantitySelector`.

The storefront resolver projects the published cart presentation. `CartStatusProvider` passes that projection into `SideCartDrawer`. Browser headers, query parameters, cookies, local storage, or component-local preferences must never override the published setting.

The setting is stored beneath:

```ts
cart: {
  showCheckoutReadiness: boolean;
  showShippingProgress: boolean;
  showQuantitySelector: boolean;
  trustMessage?: string;
}
```

The contract parser and PostgreSQL validator reject missing or non-boolean values for newly normalized version-2 compositions. The database upgrade/default path adds `showQuantitySelector: true` to existing compositions before the stricter check is installed.

## Side Cart Interaction

Each visible selector contains a 48px decrement button, a canonical quantity value, and a 48px increment button. The minimum is one and the UI maximum remains 99. Decrement at one is disabled; removal remains a separate explicit action.

Each successful click sends exactly one existing `setQuantity` request containing the selected variant, requested quantity, and current cart version. While it is pending, that line's quantity and remove controls are disabled. A successful canonical response replaces the cart and updates totals. The UI must not calculate or persist authoritative totals itself.

If a mutation fails, the drawer performs the existing single cart refresh and reports whether the canonical cart was recovered. It does not retry the write. A stale refresh cannot overwrite a newer successful mutation.

When the selector is disabled by the published theme, no increment/decrement buttons are rendered. The line still displays its canonical quantity as read-only text, and removal remains available.

## Visual Direction

- Use a clean white drawer with a restrained backdrop and subtle entry animation.
- Reduce decorative labels and excessive borders.
- Use a compact header with a clear cart title, item count, and minimal close control.
- Present product media, title, variant, unit price, quantity, and line total with a clear hierarchy.
- Keep summaries separated by light rules rather than boxed cards.
- Keep checkout as the dominant action; cart detail is secondary.
- Preserve 48px interactive targets, visible keyboard focus, dialog focus trapping, Escape/backdrop close, trigger-focus restoration, mobile safe-area padding, and reduced-motion behavior.

## Customer-Panel Experience

The existing cart design panel gains one checkbox:

```text
Miktar seçiciyi göster
```

The preview mirrors the state: enabled shows the compact selector; disabled shows read-only quantity text. Save and publish use the existing optimistic draft/publication versions, and invalid or stale mutations remain fail-closed.

## Compatibility

- Existing stores upgrade with `showQuantitySelector: true`.
- New stores initialize with `showQuantitySelector: true`.
- The full cart page retains its current editable quantity controls regardless of the side-cart option.
- No new API endpoint, dependency, credential, browser authority, or tenant/store identifier is introduced.
- No production deployment is part of this implementation task.

## Testing

Tests must first fail for the missing behavior and then pass after implementation.

- Contract tests: accept exact boolean, reject missing/non-boolean/unknown fields, and preserve immutable parsing.
- SQL tests: migrate existing compositions to `true`, validate exact keys, preserve rollback/reapply, and project the published value.
- Composer-model tests: default `true`, normalize and persist both states, preserve unsupported shipping-progress behavior.
- Customer-panel tests: render the named control and preview both states.
- Side-cart behavior tests: one increment/decrement produces one replay-safe mutation, canonical response replaces the cart, mutation failure refreshes once, and controls cannot double-submit.
- Side-cart visibility tests: enabled renders controls; disabled renders only canonical quantity text.
- Accessibility and responsive tests: dialog semantics, focus behavior, 48px targets, reduced motion, safe-area padding, no horizontal overflow, and mobile/desktop layouts.
- Regression: storefront and customer-panel tests, typecheck, builds, static-security scans, SQL harness, and `git diff --check`.

## Success Criteria

- Quantity changes work from the side cart and totals refresh from the server response.
- Merchants can save and publish selector visibility from the design panel.
- Storefront behavior follows only the published tenant-scoped setting.
- The disabled state retains truthful quantity text and removal.
- Existing stores keep quantity controls enabled after migration.
- All focused and regression verification passes with no production impact.
