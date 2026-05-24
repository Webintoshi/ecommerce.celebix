const { createJiti } = require("jiti");

const jiti = createJiti(__filename);
const { createLightPostgresCompatClient } = jiti("../../../packages/platform-config/src/light-postgres-compat.ts");

function createAdminLightPostgresCompatClient() {
  return createLightPostgresCompatClient({
    env: process.env,
    mode: "light_postgres",
  });
}

module.exports = {
  createAdminLightPostgresCompatClient,
};
