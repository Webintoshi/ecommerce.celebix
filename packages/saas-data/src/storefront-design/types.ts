import type {
  StorefrontDesignDocument,
  StorefrontDesignDraftMutation,
  StorefrontDesignPublicationMutation,
  StorefrontDesignWorkspace,
  TenantContext,
} from "@celebix/saas-contracts";

import type { PostgresPoolLike, PostgresTimeoutOptions } from "../postgres/pool.ts";

export interface StorefrontDesignAuthorityInput {
  readonly tenantContext: TenantContext;
  readonly now: Date;
}

export interface SaveStorefrontDesignDraftInput extends StorefrontDesignAuthorityInput {
  readonly operationId: string;
  readonly expectedDraftVersion: number;
  readonly design: StorefrontDesignDocument;
}

export interface PublishStorefrontDesignInput extends StorefrontDesignAuthorityInput {
  readonly operationId: string;
  readonly expectedDraftVersion: number;
  readonly expectedPublishedVersion: number;
}

export interface ReserveStorefrontDesignMediaInput extends StorefrontDesignAuthorityInput {
  readonly operationId: string;
  readonly mediaId: string;
  readonly mediaType: "image/jpeg" | "image/png" | "image/webp";
  readonly altText: string;
  readonly width: number;
  readonly height: number;
  readonly contentLength: number;
  readonly contentSha256: string;
}

export type StorefrontDesignMediaReservation = Readonly<{
  id: string;
  url: string;
  altText: string;
  mediaType: "image/jpeg" | "image/png" | "image/webp";
  width: number;
  height: number;
  objectKey: string;
}>;

export interface StorefrontDesignRepository {
  getWorkspace(input: StorefrontDesignAuthorityInput): Promise<StorefrontDesignWorkspace>;
  saveDraft(input: SaveStorefrontDesignDraftInput): Promise<StorefrontDesignDraftMutation>;
  publish(input: PublishStorefrontDesignInput): Promise<StorefrontDesignPublicationMutation>;
  reserveMedia(input: ReserveStorefrontDesignMediaInput): Promise<StorefrontDesignMediaReservation>;
}

export interface PostgresStorefrontDesignRepositoryOptions {
  readonly pool: PostgresPoolLike;
  readonly role: "celebix_saas_app";
  readonly timeouts: PostgresTimeoutOptions;
  readonly audit: (event: Readonly<{ type: "storefront_design_commit_unknown" }>) => void | Promise<void>;
}
