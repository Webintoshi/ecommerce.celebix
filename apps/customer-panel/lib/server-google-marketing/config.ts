import type {GoogleMarketingConfiguration, GoogleMarketingCredentialKeyring} from '@celebix/saas-data';
type Environment=Readonly<Record<string,string|undefined>>;
// One OAuth client/redirect serves all tenants. Missing or malformed settings leave
// this optional integration disabled rather than disabling merchant administration.
export function googleMarketingConfiguration(source:Environment,keyring:GoogleMarketingCredentialKeyring):GoogleMarketingConfiguration {
  const clientId=source.CELEBIX_GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret=source.CELEBIX_GOOGLE_OAUTH_CLIENT_SECRET;
  const rawOrigin=source.CELEBIX_GOOGLE_OAUTH_ORIGIN;
  if(!clientId||!/^[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com$/.test(clientId)||!clientSecret||clientSecret.length>512||/[\u0000-\u0020\u007f]/u.test(clientSecret)||!rawOrigin)return Object.freeze({});
  let origin:URL;try{origin=new URL(rawOrigin);}catch{return Object.freeze({});}
  if(origin.protocol!=='https:'||origin.origin!==rawOrigin||origin.username||origin.password)return Object.freeze({});
  const projectId=source.CELEBIX_GOOGLE_ADS_PROJECT_ID;
  return Object.freeze({clientId,clientSecret,panelOrigin:rawOrigin,credentialKeyring:keyring,...(projectId&&/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(projectId)?{adsProjectId:projectId}:{}),
    // The HTTP boundary has already bound the requesting host to this store;
    // the repository also checks active domain ownership before storing state.
    allowReturnOrigin:()=>true,
  });
}
