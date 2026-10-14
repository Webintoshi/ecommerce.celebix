# Toshi shop background and compact login heading

User-requested bounded revision: restore the shelves, arch, lamp and warm shop atmosphere behind the higher-quality Toshi mascot; add a small `Giriş` heading above the phone field. Preserve the approved phone form and two store/branch icons.

Implementation: real HTML h2 at 20px using the existing font/colors; independent text-free hero art; responsive same-origin WebP variants; edge-only CSS masks blend the shop scene into the canvas. Authentication, default phone-security form, existing links, tenant resolution and backend contracts are unchanged.

Assets produced with the built-in Imagegen tool; WebP resize/conversion only:
- `apps/customer-panel/public/illustrations/login-toshi-shop-640.webp` — 640×480, 31,742 bytes.
- `apps/customer-panel/public/illustrations/login-toshi-shop-960.webp` — 960×720, 54,338 bytes.
- `apps/customer-panel/public/illustrations/login-toshi-shop-1448.webp` — 1448×1086, 90,372 bytes.

Source: `/Users/Celebix/.codex/generated_images/01a0f11a-700b-7262-82d9-1f30ff77ed5f/exec-a4d586f6-53ff-42c3-9864-8df430271289.png`.

Final prompt:
> Use case: compositing / precise-object-edit. Asset type: standalone Celebix tenant login hero illustration, not a UI screenshot. Image 1 is the EDIT TARGET: preserve this higher-quality Toshi robot exactly, especially its smiling face, glossy black eyes, cream ceramic body, orange headphones, orange X chest mark, pose, hands, two ivory orange-ribbon parcels, plant and wooden counter. Image 2 is BACKGROUND REFERENCE ONLY. Restore the beautiful warm small-shop setting from Image 2 behind the premium robot: pale oak shelving on the right with neatly arranged parcels, potted trailing green plant and a simple botanical frame, ivory architectural arch, soft sunlight and leaf shadows, hanging matte-black pendant lamp. Keep Toshi large in the foreground and detailed, never shrink it to a tiny figure. Preserve warm off-white and restrained orange palette, studio-grade crisp edges, premium material texture, soft convincing light. No words, slogans, letters, language controls, UI icons, input, buttons or text of any kind anywhere; only the robot's existing X mark is permitted. Output a complete high-quality 4:3 hero scene with background, similar framing to Image 1 and the room cropped elegantly behind it. The upper-left edge should fade to uniform warm off-white #F8F7F5, providing calm negative space, with the room concentrated behind the robot and shelves. No large blank top padding, no card/border/frame, no watermark. This scene will be placed beneath separately coded headings; do not render headings into it.

Verification: 26 existing auth/presentation tests and typecheck passed. IAB 1440×900, 1024×768 and 390×844 screenshots inspected; no horizontal overflow and Giriş computed size20px. Independent Atlas UI review approved. User-requested heading takes precedence over the generic no-redundant-page-title guideline. No UI controls or text are rendered inside the new image.
