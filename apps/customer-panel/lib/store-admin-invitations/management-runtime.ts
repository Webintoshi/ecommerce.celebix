export function invitationPanelGate(source: Readonly<Record<string, string | undefined>>, config: { database: { name: string }; authority: { panelOrigin: string } }): boolean {
  return source.CELEBIX_ADMIN_INVITATIONS_ENABLED === "true" && source.CELEBIX_ADMIN_INVITATIONS_MODE === "approved_staging" && source.CELEBIX_DEPLOYMENT_TIER === "staging" && config.database.name === "celebix_saas_staging_auth01" && source.CELEBIX_ADMIN_INVITATIONS_ACCEPTANCE_ORIGIN === config.authority.panelOrigin;
}
