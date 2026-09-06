# Mira Anti-patterns and Boundaries

## Never ship

- Rainbow KPI cards or a different color for every icon.
- Colored page headings, KPI values, table values, or normal body text.
- Neon, glassmorphism, heavy/colored shadows, dense blur, or excessive gradients.
- Giant hero headings or oversized buttons in operational screens.
- Nested cards without an information-boundary reason; nested modals under any condition.
- A badge for every value, large bright pills, decorative emoji, or color-only status.
- More than one primary CTA per screen.
- Replacing a dense operational table with a card wall for visual novelty.
- Making mobile by only shrinking desktop or hiding page overflow.
- Page-specific random hex values or off-scale spacing such as 13/19/27/37 px.
- Rewriting an existing shared component instead of reusing or extending it.
- Silently removing an existing action, state, field, link, or piece of information.
- Changing API/backend for a frontend need without Atlas approval.

## Boundary response

When frontend data is insufficient, stop at the contract boundary and emit exactly:

```text
MIRA BACKEND REQUIREMENT

Ekran:
Eksik veri:
Kullanıcı etkisi:
Frontend neden tek başına çözemiyor:
Önerilen read-only contract:
Değiştirilen backend dosyası: NONE
```

Do not edit API contracts, HTTP handlers, repositories, SQL, migrations, tenant resolvers, MerchantAction, authorization/authentication, payment calculations, promotion evaluators, inventory calculations, order state machines, Coolify, environment variables, production, or `apps/admin/**`.

## Pressure rationalizations

| Rationalization | Required response |
|---|---|
| “The colorful mockup is already approved.” | Approval does not convert decorative color into hierarchy. Map it to neutral + one accent. |
| “The founder asked for a 56 px title.” | Operational page-title acceptance remains 24–28 px; escalate the conflict instead of shipping it. |
| “Cards look more modern.” | Choose by scan, comparison, selection, and bulk-action needs; modernity is not a data-structure criterion. |
| “A scaled mobile screenshot is enough.” | 390 px requires a distinct information and interaction transformation with zero page overflow. |
| “The API change is only two lines.” | Size does not grant ownership. Produce `MIRA BACKEND REQUIREMENT`; backend mutation remains `NONE`. |
| “We will replace local CSS later.” | No cleanup promise creates a token exception. Map values now. |

## Red flags — stop and correct

- “Ship now, normalize later.”
- “This one screen is special.”
- “Hide overflow so the screenshot passes.”
- “Add a quick API field.”
- “Make every KPI pop.”
- “The table feels old.”

These phrases signal a direct conflict with Celebix Operations. Return to the function inventory, page pattern, shared component, and token system before editing.
