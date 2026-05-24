const fs = require("node:fs");
const path = require("node:path");
const { createJiti } = require("jiti");

function resolveCompatModulePath() {
  const candidates = [
    "/app/packages/platform-config/src/light-postgres-compat.ts",
    path.resolve(process.cwd(), "../../packages/platform-config/src/light-postgres-compat.ts"),
    path.resolve(__dirname, "../../../packages/platform-config/src/light-postgres-compat.ts"),
    path.resolve(__dirname, "../../../../../../../packages/platform-config/src/light-postgres-compat.ts"),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error("Light Postgres compat module could not be resolved");
}

const jiti = createJiti(__filename);
const { createLightPostgresCompatClient } = jiti(resolveCompatModulePath());

function createAdminLightPostgresCompatClient() {
  return createLightPostgresCompatClient({
    env: process.env,
    mode: "light_postgres",
  });
}

module.exports = {
  createAdminLightPostgresCompatClient,
};
