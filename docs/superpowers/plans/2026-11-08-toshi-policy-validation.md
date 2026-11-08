# Toshi policy validation repair

The live Siora privacy operation failed with `invalid_output` after 22.8 seconds and charged no credits. Historical validation-stage detail was not retained. A memory-only reproduction with the same consumed merchant facts and current production sources also failed: a valid 398-word, five-section response was rejected solely because the assurance expression matched “mutlak güvenliğini” inside an explicit “garanti etmez” disclaimer.

Real-provider checks across all seven policy types also reproduced the same false positive in a KVKK clause ending “ancak bu metin mutlak güvenlik garantisi vermez”. Both observed grammatical forms have regressions. The final validator accepts eight captured outputs unchanged, including both failures, and preserves single-charge replay. A fresh KVKK provider generation completed after the final correction. No tenant wallet or saved policy was changed by these memory-only checks.

1. Add a failing service regression for the captured disclaimer and adversarial positive, quoted, mixed-clause and double-negation variants.
2. Replace the indiscriminate assurance expression with a conservative, scoped disclaimer check. Preserve the original bans, factual/number/contact checks, selected-policy binding, request authority and wallet behavior.
3. Record only safe validation-stage identifiers and numeric counts on failure; do not log policy text, merchant facts, credentials or prompts.
4. Verify policy tests, related product authoring checks, typecheck and memory-only real-provider samples. Do not save or publish a merchant policy or charge its wallet during verification.
5. Review the exact candidate and publish sequentially to both common customer-panel groups under the existing release lock, preserving the five witness applications, native catalogue and all non-source configuration. Confirm actual running sources and live editor/navigation acceptance before reporting completion.

No schema, environment, provider credential, role, package, pricing or storefront change is intended. The scope does not relax legal/factual validation or treat generated policy text as legal approval.
