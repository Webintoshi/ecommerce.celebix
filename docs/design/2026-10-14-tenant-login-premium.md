# Tenant login: native layout and standalone mascot revision

Brief: preserve the approved phone field, country picker, pale-peach submit arrow and two storefront actions. Rebuild the surrounding page, replace the screenshot-like full-room raster with a separate high-detail mascot, preserve warm neutral Celebix palette and live font family. No outer card, shadows around controls, added login prose or backend changes.

Function inventory: initial login state loading/retry, phone/country entry, explicit WhatsApp send, code entry/verification, cooldown/resend/expiry, change-phone/error recovery, fixed completion redirect; two registration actions; existing privacy/terms/support links. All preserved. Both new-store and branch actions still use the existing store registration flow as authorized.

Method: built-in Imagegen concept followed by standalone transparent mascot extraction/re-render. All headings, benefits, language text, legal/support links, phone controls and icons are native HTML/SVG/React. Only the mascot/plant/parcels/counter are raster art. Responsive WebP conversion preserves alpha; no other image editing tools used.

Concept: `/Users/Celebix/.codex/generated_images/01a0f11a-700b-7262-82d9-1f30ff77ed5f/exec-00b16087-5dc1-426f-a0cb-987aa11bbe1e.png`.
Standalone source: `/Users/Celebix/.codex/generated_images/01a0f11a-700b-7262-82d9-1f30ff77ed5f/exec-d021529d-200a-4621-844d-6021bb36f41e.png`, 1448 × 1086 RGBA.

Project assets:
- `apps/customer-panel/public/illustrations/login-mascot-premium-640.webp` — 49,072 bytes.
- `apps/customer-panel/public/illustrations/login-mascot-premium-960.webp` — 89,732 bytes.
- `apps/customer-panel/public/illustrations/login-mascot-premium-1448.webp` — 161,844 bytes.

Fidelity ledger (concept and browser screenshot inspected with view_image):
- Composition: two open columns, graphite title over independent art, legal/support links below the left column; implemented without a screenshot wrapper.
- Controls: original live phone component/CSS and both store glyphs kept exactly; concept approximations do not override the user-approved controls.
- Typography: live Inter family and neutral colors retained; code-native two-line heading, feature title/body hierarchy. Original Celebix SVG retained instead of generated wordmark approximation.
- Asset treatment: removed handwritten/raster UI text and the busy room; generated a distinct transparent high-detail mascot. Enlarged it into right edge while protecting heading overlap on short screens.
- Palette/container: original --cp-canvas/surface/text/brand tokens; no card, fake language dropdown or image tint.
- Copy: existing action, benefit, legal/support copy retained; slogan moved into a selectable heading. No new above-the-fold marketing claims or extra login instructions. Raster shopping-bag slogan removed with the bag.
- Responsive: 1440×900, 1024×768, 390×844 checked in IAB; no horizontal overflow, phone remains first on mobile; short desktop images constrained to avoid overlap.

Verification: 26 presentation/auth tests, typecheck and production build passed; independent Atlas review approved. Browser/IAB actual component checked, keyboard focus verified and mocked phone→code→fixed completion route exercised without real WhatsApp sends. Intentional differences from generated concept are original brand/font/approved phone geometry and the higher-detail standalone mascot asset. Backend/auth files changed: NONE. Source baseline b4ece71ac already live on both shared panels; Google Merchant changes preserved.

Concept prompt:
> Complete desktop Celebix tenant admin phone login. Preserve approved 80px rounded phone field, Turkish flag/country prefix, pale-peach arrow and two storefront actions. Warm #F8F7F5 canvas, existing Inter and graphite text, open 48/52 columns, no cards. Native top brand/tenant header, native heading 'İşinizi kolaylaştıran teknoloji.', new high-quality cream robot packing orange-ribbon parcels on a pale wood counter, small plant. No text inside art except robot X. Native three existing benefit columns and Gizlilik/Kullanım Şartları/Destek links, small Turkish language label with no fake dropdown. No extra login copy or heavy buttons.

Final asset prompt:
> Use case: background-extraction and identity-preserve. Edit target: the mascot art on the RIGHT SIDE of this newly created Celebix login concept. Deliver a standalone PRODUCTION HERO ASSET, NOT a screen, NOT a screenshot. Re-render/extract only the premium 3D ivory ceramic smiling robot, exactly its face, orange headphones and X chest mark, pose and hands, ivory box with orange ribbon, one smaller matching parcel, potted plant and short pale wooden counter beneath them. Keep identical subject styling/lighting, upgrade fine surface detail and glossy eye reflections to very high quality with clean smooth antialiased edges. Remove absolutely ALL text, headings, letters, language label, login controls, footer, icons and UI. No Celebix wordmark or slogan anywhere in the asset, only original chest X mark belongs to the robot. No room, no lamp, no arch, no full-page white background. True transparent alpha around the objects and above countertop; retain very soft contact shadows only beneath objects. Counter spans the composition naturally with rounded left-front edge, no dangling fake card. Output landscape about 4:3, 3072x2304 pixels if possible, tightly framing the complete robot/plant/parcels and counter, enough edge padding to keep all silhouette uncut. This will be layered beneath real selectable HTML heading; do not include any heading space filled with white. This asset needs substantially higher-quality sharp materials and clean transparency than a screenshot crop.
