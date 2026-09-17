import assert from "node:assert/strict";
import test from "node:test";
import { invitationPanelGate } from "./management-runtime.ts";
test("Panel invitation route wiring is opt-in, exact staging target and central acceptance origin only", () => {
  const env = { CELEBIX_ADMIN_INVITATIONS_ENABLED: "true", CELEBIX_ADMIN_INVITATIONS_MODE: "approved_staging", CELEBIX_DEPLOYMENT_TIER: "staging", CELEBIX_ADMIN_INVITATIONS_ACCEPTANCE_ORIGIN: "https://panel.example.test" };
  const config = { database: { name: "celebix_saas_staging_auth01" }, authority: { panelOrigin: "https://panel.example.test" } };
  assert.equal(invitationPanelGate({}, config), false);
  assert.equal(invitationPanelGate(env, config), true);
  for (const patch of [{ CELEBIX_ADMIN_INVITATIONS_ENABLED: "false" }, { CELEBIX_DEPLOYMENT_TIER: "production" }, { CELEBIX_ADMIN_INVITATIONS_ACCEPTANCE_ORIGIN: "https://foreign.example.test" }]) assert.equal(invitationPanelGate({ ...env, ...patch }, config), false);
  assert.equal(invitationPanelGate(env, { ...config, database: { name: "celebix_saas_staging_other" } }), false);
});
