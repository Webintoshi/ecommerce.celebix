# Akbank 3D Pay Hosting

Status: implementation requested by the user on 2026-10-25, including use of the existing Ezmeo merchant setup and real-store acceptance. Existing request to proceed directly with necessary work is preserved; routine implementation choices are delegated to the agent.

## Intent and approach

Make the already listed modern Akbank connection usable by merchants, starting with Ezmeo's existing **3D Pay Hosting** model. Follow the shared hosted payment architecture. The canonical provider is `akbank_json`, family `akbank`, mode `json`; the classic EST `akbank` entry remains planned.

Approaches considered: a bank-hosted card-entry POST form, collecting cards in a separate direct-POS runtime, or using another payment intermediary. The existing bank account explicitly supports the first; it preserves the hosted boundary and the merchant's own Akbank contract. No PAN/CVV collection, arbitrary bank HTML, payment intermediary or new merchant account is introduced.

Official protocol authority: Akbank's own `https://sanalpos.akbank.com/profile/help-documents`, document embedded in `https://sanalpos.akbank.com/460.02e19c63.chunk.js`, sections6.3,4.2.12,4.2.13. Local sanitized research: `.tmp/akbank-hosted-pos/official-protocol.md`. Inventory metadata is not protocol authority.

## Flow and compatibility

1. Merchant enters `merchantSafeId`, `terminalSafeId`, and `secretKey` in the existing provider drawer. Treat all as write-only credential fields; store the existing encrypted envelope, never log/return plaintext. Environment is explicit.
2. Owner worker validates credentials using a signed, read-only `1010` transaction inquiry for a generated nonexistent reference. A bank-authenticated not-found reply can validate credential possession, never successful payment or full hosting acceptance. Network/signature ambiguity remains unknown/retryable.
3. Saving valid credentials uses the existing lifecycle and real records; normal checkout method activation uses reviewed, source-bound execution authority. No fake success or blanket gate removal.
4. Standard checkout claims one durable attempt, then produces a typed `form_post` presentation. `/checkout/payment` emits an escaped fixed-field POST form and a narrowly nonced auto-submit script, with manual fallback. Browser posts card-free signed values to the exact bank endpoint. Presentation is encrypted, session-bound and expiring like existing presentations.
5. Akbank collects card/3DS data and performs sale authorization itself. Never issue an extra sale/capture after a successful hosting return.
6. Bank POST returns to the existing operation-bound callback. Verify its HMAC, merchant/terminal/order/totals, then signed `1010` inquiry before marking paid. Native capture still controls inventory, accounting and order completion once. Duplicate/late/wrong-store/wrong-amount/ambiguous responses cannot manufacture payment success.
7. Existing callback customer-return behavior and result page show success/failure/processing. No browser polling or additional permanent worker loop is added beyond existing reconciliation.

## Protocol constraints

- Live hosting `https://virtualpospaymentgateway.akbank.com/payhosting`; test `https://virtualpospaymentgatewaypre.akbank.com/payhosting`.
- JSON inquiry live `https://api.akbank.com/api/v1/payment/virtualpos/transaction/process`; test `https://apipre.akbank.com/api/v1/payment/virtualpos/transaction/process`.
- Form uses `paymentModel=3D_PAY_HOSTING`, `txnCode=3000`, `currencyCode=949`, exact decimal TRY amount, rewards zero, order reference1–36 ASCII alphanumeric/underscore/hyphen,128-hex nonce,23-character timestamp. No secret key in the form.
- HMAC-SHA512 with the literal UTF-8 secret string, Base64 output. Exact published hosting field sequence; empty optional fields remain empty. Dynamic callback `hashParams` order must be parsed safely and bound critical fields required in that signed set.
- JSON request `auth-hash` authenticates the exact transmitted bytes; response `auth-hash` authenticates raw response bytes before parsing. Duplicate JSON/form keys are rejected. Credential validation never sends a sale request.
- Paid requires authenticated matching sale result (`txnCode=1000`, `VPS-0000`, normal final status), amount/currency/order identity. Pending `3000`, reversal, suspicious/unknown or missing data remains unpaid/processing. Do not assume an outer inquiry success means paid.
- Initial safe support is TRY and single payment unless the official hosted-page contract proves a bounded installment selector. Advertise only implemented behavior; reject unsupported preferences, never silently change them.

## Narrow interfaces

- `HostedPaymentInitialization` gains `{kind:'form_post',url,fields:Readonly<Record<string,string>>,providerReference}`.
- Runtime `HostedPaymentPresentation` gains the same public shape without providerReference.
- Packet presentation rule gains `{kind:'provider_form_post',url,fieldNames:readonly string[]}`. Exact provider/environment endpoint and fixed card-free field allowlist are mandatory; no caller-defined URL/header/HTML.
- Transport adds an Akbank-only exact JSON `auth-hash` request header tuple and response signature projection. PayTR/iyzico response shapes and header admission retain existing behavior.
- Data/native provider allowlists gain only `akbank_json`; explicit `form_post` presentation metadata is additive. Existing immutable tariff and historical order/payment snapshots are unchanged.

## Verification and release

Use independent fixed HMAC fixtures, amount boundaries, invalid/missing/duplicate signature fields, wrong tenant/order/amount/currency, raw JSON tampering, zero/failed/pending/reversed status and duplicate callback tests. Exercise escaped form/CSP/session expiry and safe replay. Run existing payment suites and native compatibility suites; preserve PayTR/iyzico compiled authorities with an explicitly reviewed compatible source manifest, never copied/fabricated evidence.

Prepare additive native migration275 only after disposable PostgreSQL16 rehearsal, restore/backup verification and current catalog baseline capture. Publish compatible owner readers first, then shared customer panels and storefronts NET→SITE under the single canonical publisher. Exact-candidate signup proof is required before each queue; source/ref/pin/native/capacity admission uses fresh receipts.

Real-store acceptance: validate Ezmeo credentials without charging, inspect actual bank-hosted checkout, and let the user perform any final real card/payment step. Never create/rotate a bank credential or bypass bank/browser security. Record actual scope and any remaining acceptance instead of claiming an unperformed payment succeeded. Existing provider rights remain unchanged.
