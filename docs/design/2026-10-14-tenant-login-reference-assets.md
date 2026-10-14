# Shared tenant login reference asset

Source: user-supplied reference `codex-clipboard-45195a43-a702-4d1b-9877-cce30d333d54.png`.
Method: built-in Imagegen edit; UI footer and language label removed from the raster and implemented as HTML. Original generated output preserved in Codex generated_images. Responsive WebP conversion only, no additional image edits.

Project assets:
- `apps/customer-panel/public/illustrations/login-celebix-scene-480.webp` — 480 × 480, 21,320 bytes.
- `apps/customer-panel/public/illustrations/login-celebix-scene-960.webp` — 960 × 960, 49,282 bytes.
- `apps/customer-panel/public/illustrations/login-celebix-scene-1254.webp` — 1254 × 1254, 67,376 bytes.

Final prompt:
> Use case: precise-object-edit. Asset type: right-side hero illustration for Celebix login page. This image is the edit target. Preserve the actual robot packing scene as faithfully as possible: same smiling cream robot, its exact pose, orange X on chest and headphones, arch, hanging black lamp, plants, shelves, orange ribbon boxes, wooden counter, warm pale cream colors and soft lighting. Preserve the handwritten slogan at the left, exactly 'İşinizi kolaylaştıran teknoloji' with thin orange underline. Preserve shopping bag branding 'Celebix' and 'DAHA FAZLASI SENİNLE'. Remove ONLY the small top-right 'Türkçe' text/chevron and ALL the bottom interface beneath the wooden counter: three icon/text benefit blocks, dividers, and Gizlilik/Kullanım Şartları/Destek links. Crop tightly to the illustration scene ending just below the wooden counter front edge, no UI footer and no extra bottom empty space. Output one clean hero artwork asset, portrait/squarish crop preserving the full bag/plant/robot scene. Left edge fades naturally to warm off-white as in target. Do not redesign, do not add new UI, no phone input, no card, no new objects.

Function inventory: tenant branding; initial login-state loading and retry; country/phone entry; explicit send; six-digit code verification; resend cooldown and expiry; phone change; error and safe retry recovery; fixed completion redirect. All preserved without backend or authentication changes. Store and branch entry links both use the existing registration flow, as instructed. Privacy, terms and support link to existing public Celebix pages. Login currently supports Turkish only; the language label is not an interactive language switch.

Validation: 26 auth/presentation tests, Customer Panel typecheck and production build; independent Atlas review; actual component preview at 1440 × 900, 1024 × 768, 390 × 844 without horizontal overflow. Mock verification flow checked locally; no real WhatsApp messages sent.
