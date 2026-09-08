// Persisted event/delivery IDs include PostgreSQL md5(...)::uuid values.
// They are opaque record keys, not authority UUIDs. Never normalize/rekey them.
const STORED_RECORD_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function storedRecordId(value: unknown): string {
  if (typeof value !== "string" || value.length !== 36 || !STORED_RECORD_ID.test(value)) {
    throw new TypeError("order_contract_invalid");
  }
  return value;
}

/** Only OrderEvent.id; store/order/principal/operation IDs retain strict validators. */
export function parseOrderEventId(value: unknown): string { return storedRecordId(value); }

/** Syntax only. Callers must still authorize tenant + order + delivery/lease scope. */
export function parseOrderDeliveryId(value: unknown): string { return storedRecordId(value); }
