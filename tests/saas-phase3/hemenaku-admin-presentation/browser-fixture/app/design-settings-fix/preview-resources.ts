import type { StarterThemeComposition, StorefrontDesignWorkspace } from "@celebix/saas-contracts";
import { storefrontDesignPreviewDependencyKey, type StorefrontDesignPreviewResources } from "../../../../../../apps/customer-panel/lib/storefront-design-preview-model";
import { parseStorefrontDesignPreviewResources } from "../../../../../../apps/customer-panel/lib/storefront-design-preview-ui/client";
import postgresSnapshot from "./postgres-preview-snapshot.json";

// The disposable PG16 harness asserts this payload against the real public
// repository. Only the dependency key follows the current draft; labels and
// section order are recomposed from that draft by the production model.
export async function designFixturePreviewResources(workspace: StorefrontDesignWorkspace, composition: StarterThemeComposition = workspace.draft.composition): Promise<StorefrontDesignPreviewResources> {
  const dependencyKey = storefrontDesignPreviewDependencyKey(composition);
  return parseStorefrontDesignPreviewResources({ ...postgresSnapshot, dependencyKey }, dependencyKey);
}
