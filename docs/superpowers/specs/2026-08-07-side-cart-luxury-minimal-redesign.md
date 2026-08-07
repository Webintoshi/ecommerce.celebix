# Side Cart Luxury Minimal Redesign

Status: Kullanıcı tarafından yazılı olarak onaylandı

Date: 2026-08-07

## Goal

Revise the existing starter-theme side cart into a compact, modern and conversion-focused drawer without changing its canonical cart authority, checkout rules or mutation semantics.

## Considered Directions

1. **Luxury Minimal (selected):** restrained typography, compact product rows, a sticky summary, one dominant checkout action and a low-emphasis cart-detail link.
2. **Retail Dense:** smaller media and denser table-like rows. This shows more lines but feels operational rather than premium.
3. **Editorial:** larger product media and more serif typography. This is visually expressive but wastes drawer space and weakens checkout focus.

The selected direction fits the jewelry storefront, removes the large empty vertical gap shown in the current drawer and keeps the cart easy to scan on desktop and mobile.

## Existing Authority and Behavior

- Continue using `CartStatusProvider` as the only browser-side source of the canonical cart.
- Continue using the existing replay-safe `setQuantity` and remove mutations through `mutateSideCartLine`.
- Totals, shipping, blockers, prices and availability always come from the canonical server response.
- Continue honoring the published tenant-scoped `cart.showQuantitySelector` setting.
- Do not introduce local-storage cart authority, client-computed totals, new endpoints or a second cart implementation.
- Preserve the existing checkout URL, cart URL, focus trap, Escape and backdrop close, focus restoration, reduced-motion behavior and fail-closed states.

## Layout

### Drawer

- Keep the drawer right-aligned and full-height, with a maximum desktop width around 440–460px and full viewport width on small screens.
- Use a white surface, restrained shadow, subtle backdrop and a compact header.
- The line-items region scrolls only when its content exceeds the available height. A single item must sit directly below the header instead of creating a fabricated spacer.
- Keep the summary attached to the bottom of the drawer, separated by a subtle border and soft elevation.

### Header

- Replace the oversized two-level heading with a compact `Sepetim` title and canonical item-count copy.
- Keep a 48×48px close target with a simple icon and visible focus state.
- Avoid decorative labels that compete with the primary content.

### Product Line

- Use a compact media block with a subtle radius and `object-fit: contain` so jewelry is not cropped.
- Allow the product title to wrap to two lines; never clip it to an unreadable single line.
- Show variant information only when it is meaningful.
- Show one clear price hierarchy. Avoid presenting unit price and line total as competing duplicate labels when quantity is one.
- Place the quantity selector or read-only quantity and the remove action on the same lower utility row.
- When enabled, the selector keeps 48px decrement/increment targets, the range 1–99 and one mutation per action.
- The remove action remains visible but visually secondary.

## Summary and Actions

- Keep subtotal, shipping and total truthful and compact.
- Keep checkout-readiness and configuration notices driven by the existing canonical blocker values.
- Preserve the published trust message only when configured; do not invent urgency, discounts, progress bars or delivery claims.
- Render one full-width primary action: `Ödemeye geç`.
- Render `Sepeti görüntüle` beneath it as a quieter secondary text link.
- If checkout is stock-blocked, retain the disabled checkout state.
- If payment or shipping is unavailable, preserve the existing truthful route behavior while using concise copy; the UI must not suggest a successful payment configuration.

## Responsive and Accessibility Requirements

- All interactive targets are at least 48×48px.
- The drawer has no horizontal overflow at 320px and wider viewports.
- Product title, price and controls remain legible at 320×720 and 390×844.
- The footer respects `env(safe-area-inset-bottom)` and does not cover the last cart line.
- Keyboard focus is trapped while open; Escape and backdrop close the drawer; closing restores focus to the cart trigger.
- Focus indicators remain visible, the dialog retains its accessible name, live mutation status remains announced and reduced motion shortens animations.

## Error and Empty States

- Loading, unavailable and empty states stay inside the same drawer shell.
- Unavailable state remains retryable without fabricating cart data.
- Mutation failures continue to perform the existing single canonical refresh and never retry the write automatically.
- Unavailable products retain their existing stock/price warning and cannot silently bypass checkout blockers.

## Testing

Focused tests must prove:

- the compact header includes the canonical item count;
- long product titles wrap without one-line truncation;
- one clear price hierarchy is rendered for quantity one and a truthful line total for larger quantities;
- quantity controls and remove action share the compact utility row;
- the published quantity-selector setting still controls editable versus read-only quantity;
- checkout is the only dominant full-width action and cart detail is secondary;
- canonical blockers, configuration notices and links are unchanged;
- the single-item drawer does not contain an artificial content spacer;
- 48px targets, focus trap, Escape/backdrop close, focus restoration, reduced motion, safe-area padding and 320px overflow requirements remain satisfied;
- existing mutation, cart-provider, storefront tests, typecheck and build remain green.

## Acceptance Criteria

- The drawer matches the approved Luxury Minimal direction.
- The excessive blank area and detached product actions visible in the supplied reference are removed.
- Product identity, image, quantity, remove action and total are immediately scannable.
- `Ödemeye geç` is dominant and `Sepeti görüntüle` is secondary.
- No cart, checkout, tenant, store or browser authority is weakened.
- No production deployment is implied by this design document.
