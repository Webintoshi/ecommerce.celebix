export type AuthoritySlice<T extends object> =
  | Readonly<{ state: "ready"; value: Readonly<T>; asOf: string }>
  | Readonly<{ state: "empty"; message: string }>
  | Readonly<{ state: "locked"; feature: string }>
  | Readonly<{ state: "unavailable"; retryable: boolean }>
  | Readonly<{ state: "unsupported"; capability: string }>;

const text = (value: string) => {
  if (!value || value !== value.trim() || value.length > 120 || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new Error("panel_authority_slice_invalid");
  }
  return value;
};

export function readyAuthority<T extends object>(value: T, asOf: string): AuthoritySlice<T> {
  if (!Number.isFinite(Date.parse(asOf))) throw new Error("panel_authority_slice_invalid");
  return Object.freeze({ state: "ready" as const, value: Object.freeze({ ...value }), asOf });
}

export const emptyAuthority = (message: string): AuthoritySlice<never> =>
  Object.freeze({ state: "empty", message: text(message) });

export const unavailableAuthority = (retryable: boolean): AuthoritySlice<never> =>
  Object.freeze({ state: "unavailable", retryable });

export const unsupportedAuthority = (capability: string): AuthoritySlice<never> =>
  Object.freeze({ state: "unsupported", capability: text(capability) });
