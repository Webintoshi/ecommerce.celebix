import type { ResolvedStoreHost, StoreStatus } from "@celebix/saas-contracts";

import { StorefrontResolutionError } from "./errors.ts";

export type StoreDomainResolution = ResolvedStoreHost | StorefrontResolutionError;

export interface StoreDomainResolver {
  resolveExactHostname(normalizedHostname: string): Promise<StoreDomainResolution>;
}

export interface InMemoryStoreDomainRecord {
  host: ResolvedStoreHost;
  storeStatus: StoreStatus;
}

/** Test-only exact resolver. Production persistence is supplied behind StoreDomainResolver later. */
export class InMemoryStoreDomainResolver implements StoreDomainResolver {
  readonly #records: readonly InMemoryStoreDomainRecord[];

  constructor(records: readonly InMemoryStoreDomainRecord[]) {
    this.#records = records.map((record) => ({ ...record, host: { ...record.host } }));
  }

  async resolveExactHostname(normalizedHostname: string): Promise<StoreDomainResolution> {
    const matches = this.#records.filter((record) => record.host.hostname === normalizedHostname);

    if (matches.length === 0) {
      return new StorefrontResolutionError("host_not_found");
    }

    if (matches.length !== 1) {
      return new StorefrontResolutionError("ambiguous_host");
    }

    const [record] = matches;
    if (record.host.status === "pending_verification") {
      return new StorefrontResolutionError("host_unverified");
    }

    if (record.host.status !== "active" || record.storeStatus !== "active") {
      return new StorefrontResolutionError("store_inactive");
    }

    return { ...record.host };
  }
}
