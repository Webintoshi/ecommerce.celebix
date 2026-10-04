# Customer panel interface rules

- A successful Save/Apply must create or update the real record and apply its intended effect directly. Do not add a customer-facing save-draft then publish/activate/confirm sequence. New valid product and blog/page saves publish by default; deliberate hide/archive choices remain available. Preserve explicit physical receipt, stock-count completion and payment collection actions, operation keys, form buffers and safe retry recovery. Opening an old draft must never publish it without an explicit Save/Apply.

- Do not add a visible page title inside a working screen or repeat it in the top bar. Keep a semantic page heading available to assistive technology. Use a concise section label only when a nested view needs orientation.
- Let data, controls, and visual hierarchy carry the page. Use the fewest words that still make actions, states, and decisions clear; remove decorative introductions and repeated explanations.
- Empty and error states should state the issue once and offer a useful next action. Never hide critical status or accessibility labels merely to reduce copy.
- Operational illustrations must extend the existing flat SVG family: white/soft-neutral shapes, rounded graphite/slate outlines and small orange accents, as in dashboard ProductsEmptyArtwork/SalesEmptyArtwork and analytics EmptyIllustration. Use the shared --cp-art-* palette. Do not substitute 3D product renders for this family; existing separately approved brand/mascot assets keep their role.
