import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildSelfServeRegistryMirror } from "./self-serve-store-registry-mapping";

describe("buildSelfServeRegistryMirror", () => {
  it("maps local registry and store configs into read-only registry rows with safety warnings", () => {
    const result = buildSelfServeRegistryMirror({
      registryEntries: [
        { slug: "deri-kordon", name: "Deri Kordon", domain: "derycraft.com", theme: "leather", status: "active" },
        { slug: "derycraftcomtr", name: "DeryCraft 2", domain: "derycraft.com.tr", theme: "leather", status: "draft" },
        { slug: "orphan-store", name: "Orphan Store", domain: "orphan.example", theme: "atelier", status: "draft" },
        { slug: "dupe-domain-a", name: "Dupe A", domain: "same.example", theme: "atelier", status: "draft" },
        { slug: "dupe-domain-b", name: "Dupe B", domain: "same.example", theme: "atelier", status: "draft" },
      ],
      storeConfigs: [
        {
          slug: "deri-kordon",
          name: "DeryCraft",
          status: "active",
          databaseMode: "light_postgres",
          domains: { storefront: "derycraft.com", admin: "panel.celebix.co", demo: "deri-kordon.celebix.shop" },
          r2: { bucketName: "deri-kordon-assets", publicUrl: "https://assets.example", managedDomain: "assets.example" },
          bootstrap: {
            adminDeploymentName: "deri-kordon-admin",
            adminDeploymentBranch: "deploy/owner",
            adminDeploymentRuntimeUrl: "https://panel.celebix.co",
            adminDeploymentResourceId: "admin-resource",
            adminDeploymentStatus: "configured",
          },
          storefront: {
            appDir: "apps/storefront-deri-kordon",
            deploymentName: "deri-kordon-storefront",
            deploymentBranch: "deploy/derycraft",
            runtimeUrl: "https://derycraft.com",
            resourceId: "storefront-resource",
            deploymentStatus: "configured",
          },
        },
        {
          slug: "derycraftcomtr",
          name: "DeryCraft 2",
          status: "draft",
          domains: { storefront: "derycraft.com.tr", admin: "admin.derycraft.com.tr" },
        },
        {
          slug: "dupe-domain-a",
          name: "Dupe A",
          status: "draft",
          domains: { storefront: "same.example", admin: "admin-a.same.example" },
        },
        {
          slug: "dupe-domain-b",
          name: "Dupe B",
          status: "draft",
          domains: { storefront: "same.example", admin: "admin-b.same.example" },
        },
      ],
      knownExternalStoreSlugs: ["hemenaku", "skoriq", "celebix-cms"],
    });

    assert.equal(result.summary.totalSourceStores, 5);
    assert.equal(result.summary.proposedStores, 4);
    assert.equal(result.summary.proposedDomains, 8);

    assert.deepEqual(
      result.stores.map((store) => store.slug),
      ["deri-kordon", "derycraftcomtr", "dupe-domain-a", "dupe-domain-b"],
    );
    assert.equal(result.stores.find((store) => store.slug === "deri-kordon")?.status, "active");

    assert.deepEqual(
      result.domains
        .filter((domain) => domain.storeSlug === "deri-kordon")
        .map((domain) => [domain.hostname, domain.domainType, domain.isPrimary]),
      [
        ["derycraft.com", "storefront", true],
        ["panel.celebix.co", "admin", true],
      ],
    );

    assert.deepEqual(result.deploymentRefs["deri-kordon"], {
      adminDeploymentName: "deri-kordon-admin",
      adminDeploymentBranch: "deploy/owner",
      adminDeploymentRuntimeUrl: "https://panel.celebix.co",
      adminDeploymentResourceId: "admin-resource",
      adminDeploymentStatus: "configured",
      storefrontAppDir: "apps/storefront-deri-kordon",
      storefrontDeploymentName: "deri-kordon-storefront",
      storefrontDeploymentBranch: "deploy/derycraft",
      storefrontRuntimeUrl: "https://derycraft.com",
      storefrontResourceId: "storefront-resource",
      storefrontDeploymentStatus: "configured",
      r2BucketName: "deri-kordon-assets",
      r2PublicUrl: "https://assets.example",
      r2ManagedDomain: "assets.example",
    });

    assert.ok(result.warnings.some((warning) => warning.code === "missing_store_config" && warning.slug === "orphan-store"));
    assert.ok(result.warnings.some((warning) => warning.code === "duplicate_domain" && warning.value === "same.example"));
    assert.ok(result.warnings.some((warning) => warning.code === "missing_membership_mapping"));
    assert.ok(result.warnings.some((warning) => warning.code === "legacy_split_store"));
    assert.ok(result.warnings.some((warning) => warning.code === "known_external_store_missing" && warning.slug === "hemenaku"));
  });
});
