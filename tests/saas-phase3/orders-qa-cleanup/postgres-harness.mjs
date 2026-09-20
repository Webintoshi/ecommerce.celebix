// Compatibility entrypoint: the physical-delete rehearsal has been retired.
// The replacement exercises archive/restore against actual migrations and
// immutable triggers, never a simplified schema that permits deleting history.
await import('../orders-qa-archive/postgres-harness.mjs');
