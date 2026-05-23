import assert from "node:assert/strict";

import { getGeneratedDeploymentModelGuardFailure } from "../lib/generated-deployment-model.ts";

assert.match(
  getGeneratedDeploymentModelGuardFailure({
    target: "admin",
    deploymentStrategy: "legacy_git_push",
    dockerImage: "ghcr.io/celebixco/demo-admin",
    dockerImageTag: "production",
    useBuildServer: true,
    buildServer: "celebix-build-01",
    watchPaths: ["apps/admin/**", "packages/**"],
  }) ?? "",
  /build_server_ghcr/,
);

assert.equal(
  getGeneratedDeploymentModelGuardFailure({
    target: "storefront",
    deploymentStrategy: "build_server_ghcr",
    dockerImage: "ghcr.io/celebixco/demo-storefront",
    dockerImageTag: "production",
    useBuildServer: true,
    buildServer: "celebix-build-01",
    watchPaths: ["apps/storefront-demo/**", "packages/**"],
  }),
  null,
);

console.log("owner-light-postgres-e2e-blockers-smoke=pass");
