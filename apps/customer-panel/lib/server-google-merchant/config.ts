import {parseCustomerPanelStagingAuthConfig,CUSTOMER_PANEL_STAGING_AUTH_ENVIRONMENT_FIELDS} from '../panel-auth-authority/config.ts';
export function merchantWorkerAuthConfiguration(source:Readonly<Record<string,string|undefined>>) {
 return parseCustomerPanelStagingAuthConfig(Object.fromEntries(CUSTOMER_PANEL_STAGING_AUTH_ENVIRONMENT_FIELDS.map(field=>[field,source[field]])));
}
