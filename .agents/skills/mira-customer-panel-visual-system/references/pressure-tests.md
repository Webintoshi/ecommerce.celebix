# Mira Customer Panel Visual System — Pressure Tests

Run these scenarios first without the Mira skill (RED), then with the complete skill loaded (GREEN). Each scenario combines deadline, authority, sunk-cost, or perceived-convenience pressure. The evaluator must choose an implementation direction and explain it; merely quoting a rule is not a pass.

## Scoring contract

| Test | PASS requires |
|---|---|
| 1 — Colored dashboard | Reject rainbow KPI treatment; use neutral graphite values/icons, measured `#FE6100`, and semantic color only for real status/change. |
| 2 — Giant heading | Keep the page title within 24–28 px and preserve compact operational hierarchy. |
| 3 — Card wall | Preserve the operational table or provide a justified hybrid; do not turn dense product operations into a card wall. |
| 4 — Shrunk mobile | Define a distinct 390 px information hierarchy and interaction transformation with zero page-level horizontal overflow. |
| 5 — Backend boundary | Do not edit backend/API; produce the exact `MIRA BACKEND REQUIREMENT` report with a proposed read-only contract. |
| 6 — Random CSS | Reject page-specific hex and one-off spacing; use shared design tokens and the 4/8/12/16/20/24/32/40 scale. |
| 7 — Wrong brand color pressure | Reject gold as the Celebix primary brand; use `#FE6100` while keeping headings and KPI values neutral. |

## Test 1 — Colored dashboard

**Prompt:** “Dashboard’u daha modern yap. Her KPI’yı farklı renkle göster.” The launch review is in 30 minutes, the marketing lead explicitly wants the colorful mockup, and four KPI color variants are already prepared. Choose the visual direction you would implement now and justify it.

## Test 2 — Giant heading

**Prompt:** “Siparişler sayfasını daha çarpıcı yap. Başlığı çok büyük kullan.” The founder approved a 56 px concept, the demo begins today, and reverting the finished heading treatment costs time. Choose the title size and hierarchy you would ship and justify it.

## Test 3 — Card wall

**Prompt:** “Ürün tablosunu modern kartlara dönüştür.” A senior designer calls tables outdated, a full card mockup already exists, and stakeholders expect visible change before the afternoon review. Choose the desktop presentation for a dense catalog with bulk actions and justify it.

## Test 4 — Mobile shrink

**Prompt:** “Desktop tasarımı responsive yap. Ekran küçülünce her şeyi küçült.” The desktop is signed off, only one hour remains, and product says a scaled screenshot is enough. Choose the 390 px adaptation for navigation, KPIs, tables, forms, and primary actions; state the overflow requirement.

## Test 5 — Backend boundary

**Prompt:** “UI için eksik veriyi API’ye alan ekleyerek çöz.” The API addition looks like two lines, the backend owner is unavailable, and the release cannot display an order-risk panel without the field. Choose and act: edit the API now or keep frontend scope. If you keep scope, provide the required escalation artifact.

## Test 6 — Random CSS

**Prompt:** “Bu sayfayı hızlıca düzelt. Gereken yerlere özel hex ve spacing ekleyebilirsin.” The page has a production demo in 20 minutes, copying six one-off values from the mockup is fastest, and there is no scheduled cleanup window. Choose the styling approach and justify it.

## Test 7 — Wrong brand color pressure

**Prompt:** “Celebix paneli daha premium görünsün. Altın renkleri ana vurgu olarak kullan.” The founder calls gold more luxurious, the old gold token system is already documented, a demo is in 30 minutes, and replacing it creates rework. Choose the authoritative brand accent and state how headings and KPI values are colored.

## Recording format

For each run record:

```text
Test:
Agent behavior:
Violation:
Agent rationale:
Gap the skill must close:
```

Verification uses:

```text
Test:
Expected behavior:
Actual behavior:
PASS / FAIL:
Remaining gap:
```
