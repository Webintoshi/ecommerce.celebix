# Toshi policy generation and recovery

Siora's latest two policy operations ended as `failed/invalid_output` after 23.6 and 25.9 seconds. Both released their seven-credit hold. The browser nevertheless retained an uncertain-operation receipt and exposed only a manual result-check action. Policy recovery has no automatic same-operation reconciliation.

1. Remove runtime editorial vetoes based on words, numbers, contacts, heading count and word count. Keep authenticated tenant authority, selected-policy/version binding, output encoding/size limits, safe HTML, secret-leak checks and single-charge replay. The prompt still asks for accurate merchant-specific draft text.
2. Automatically reconcile interrupted responses and restored receipts using the exact saved operation and request, with bounded retries and a plain retry action if the connection remains unavailable. Never create a fresh paid operation while the previous result is unconfirmed.
3. Add regressions before implementation, run focused policy UI/server/HTTP checks and one typecheck. Verify real-provider output through the actual service with memory-only merchant/wallet adapters; do not save tenant policies or spend tenant credits.
4. Publish the exact reviewed candidate sequentially to both shared panel groups, verify running sources and live policy/navigation UI, preserve all other application configuration and native catalogue.

The observed failures do not justify increasing the generation timeout. This repair adds no schema, environment, role, package, payment or storefront change.

Verification: 69 policy UI checks, 63 server/HTTP checks and the customer-panel typecheck pass. A real DeepSeek privacy-policy generation completed in 28 seconds through the actual service using memory-only wallet/policy repositories. The recovery regression also covers a previously dispatched 40-second generation: at most seven same-key calls span 48.5 seconds of scheduled backoff, then stop. Closing cancels scheduled retries; completed previews still require explicit Apply and Save.
