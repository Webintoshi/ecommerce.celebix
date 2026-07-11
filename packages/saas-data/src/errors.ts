import type { UniqueConflictKind } from "./types.ts";

export class SaaSDataUniqueConflict extends Error {
  readonly kind: UniqueConflictKind;

  constructor(kind: UniqueConflictKind) {
    super(`Unique conflict: ${kind}`);
    this.name = "SaaSDataUniqueConflict";
    this.kind = kind;
  }
}
