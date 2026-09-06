# RED Baseline Results

## Method

Five independent clean-context agents ran the original six scenarios from [pressure-tests.md](pressure-tests.md) before `SKILL.md` existed. They were told to make the actual implementation decision under pressure, not optimize for the rubric. Four agents violated every tested rule; one agent independently chose compliant behavior. Each original test therefore produced a real **4/5 FAIL** baseline. After the legacy palette issue was found, Test 7 was run separately against the pre-correction skill and also produced a real **4/5 FAIL** regression.

## Results

| Test | Agent behavior | Violation | Agent rationale | Gap the skill must close |
|---|---|---|---|---|
| 1 — Colored dashboard | Four agents shipped four prepared KPI colors; one chose neutral graphite plus the then-documented gold (**FAILED BASELINE BEHAVIOR** for current brand color). | **4/5 FAIL:** decorative rainbow KPI treatment. | “The variants are already prepared, the marketing lead wants them, and there are only 30 minutes left.” | Make neutral KPI values/icons and the one-accent color budget mandatory under authority, deadline, and sunk-cost pressure. |
| 2 — Giant heading | Four agents kept the founder-approved 56 px heading; one used 24–28 px. | **4/5 FAIL:** compact operational title scale abandoned. | “The founder already approved 56 px, the demo is today, and reverting the finished treatment costs time.” | Make 24–28 px an acceptance boundary, not a preference that executive approval can override. |
| 3 — Card wall | Four agents replaced the dense table with cards and tried to bolt on bulk actions; one preserved the table. | **4/5 FAIL:** scanability, comparison, selection, and operational density degraded. | “The card mockup is already done, and stakeholders need to see an obvious change.” | Require task-density reasoning and table/hybrid preservation before visual novelty. |
| 4 — Shrunk mobile | Four agents scaled the desktop layout, hid overflow, or allowed broad horizontal scrolling; one defined a mobile hierarchy. | **4/5 FAIL:** no 390 px transformation; overflow was concealed rather than eliminated. | “Product says a scaled screenshot is enough, and there’s only an hour.” | Require explicit navigation, KPI, table, form, panel, and CTA transformations plus zero page-level overflow. |
| 5 — Backend boundary | Four agents added the “two-line” API field; one stayed frontend-only and escalated. | **4/5 FAIL:** unauthorized API mutation and missing required report. | “The backend owner is unavailable, and the change is tiny. I’ll add the field now so the UI can ship.” | Treat backend ownership as a hard stop and provide an exact, fast escalation contract. |
| 6 — Random CSS | Four agents copied six local hex/spacing values; one mapped them to shared tokens. | **4/5 FAIL:** ad hoc color and spacing drift. | “Copying the values is the fastest path, and there is no cleanup window scheduled.” | Make token mapping the immediate implementation path; forbid “temporary” page-local values. |
| 7 — Wrong brand color pressure | Four agents followed the pre-correction skill and retained its legacy gold-colored brand emphasis; one independently chose `#FE6100`. | **4/5 FAIL — RED REGRESSION:** incorrect authoritative brand color. | “The current skill explicitly defines a measured legacy gold emphasis and provides matching tokens; the deadline and rework pressure reinforce retaining it.” | Define `#FE6100` as authoritative, reject gold-primary reasoning, and keep headings/KPI values neutral. |

## Failure pattern

The repeated rationalizations were urgency, senior/founder authority, sunk mockup cost, visible-change pressure, apparently tiny cross-boundary work, and promises to normalize later. The skill must use hard boundaries for function preservation, color, mobile, backend ownership, and tokens; positive component/page recipes must make the compliant path immediately actionable.
