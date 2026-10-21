import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

// These are existing shared Docker services. No caller-provided backend,
// default tenant, certificate resolver, or per-store deployment is permitted.
const environments = Object.freeze({
  staging_net:Object.freeze({name:'net',suffix:'saas-staging.celebix.net',admin:'https-0-e4xe74cmii7jucbkyor0o412@docker',storefront:'https-0-h55zoba9jh6ij8g6irpqzd9i@docker'}),
  staging:Object.freeze({name:'site',suffix:'saas-staging.celebix.site',admin:'https-0-yk1h6d97z7ex0h74ok3zrj5c@docker',storefront:'https-0-vtc2aah63jbqnmtxmvykn6jl@docker'}),
});
export const RESERVED_PLATFORM_LABELS = Object.freeze(['admin','api','assets','auth','cdn','ecommerce','media','owner','panel','status','support','www']);
export const TENANT_WILDCARD_BINDINGS = Object.freeze({
  staging_net:Object.freeze({storefrontAuthorityMiddleware:'celebix-storefront-authority-h55zoba9jh6ij8g6irpqzd9i@docker',adminOtpMiddleware:'celebix-admin-login-ingress-auth@file',storefrontOtpMiddleware:'celebix-admin-login-ingress-auth@file'}),
  staging:Object.freeze({storefrontAuthorityMiddleware:'celebix-storefront-authority-vtc2aah63jbqnmtxmvykn6jl@docker',adminOtpMiddleware:'celebix-admin-login-ingress-auth@file',storefrontOtpMiddleware:'celebix-admin-login-ingress-auth@file'}),
});
const fields = ['storefrontAuthorityMiddleware','adminOtpMiddleware','storefrontOtpMiddleware'];
const invalid = () => {throw new TypeError('tenant_wildcard_routes_invalid');};

function exactRecord(input,keys) {
  if(!input || typeof input!=='object' || Array.isArray(input) || Object.getPrototypeOf(input)!==Object.prototype || Object.keys(input).sort().join(',')!==[...keys].sort().join(',')) invalid();
}
function middlewareReference(value) {
  if(typeof value!=='string' || !/^[a-z][a-z0-9-]{0,127}@(docker|file)$/.test(value) || ['gzip@docker','celebix-tenant-https@file'].includes(value)) invalid();
  return value;
}
function hostRule(suffix) {
  const escaped = suffix.replaceAll('.','\\.');
  const hostname = `HostRegexp(\`^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.${escaped}$\`)`;
  return [hostname,...RESERVED_PLATFORM_LABELS.map(label => `!Host(\`${label}.${suffix}\`)`)].join(' && ');
}

/** Produces only a Traefik v3 file-provider route document, without side effects.
 * Middleware names must be confirmed against live proxy metadata by the caller.
 * The separate TLS file supplies trusted certificates before these routes go live.
 */
export function createTenantWildcardRoutes(bindings) {
  exactRecord(bindings,Object.keys(environments));
  for(const environment of Object.keys(environments)) {
    const references = bindings[environment];
    exactRecord(references,fields);
    for(const field of fields) {
      middlewareReference(references[field]);
      if(references[field]!==TENANT_WILDCARD_BINDINGS[environment][field]) invalid();
    }
  }
  const routers = {};
  for(const [environment,definition] of Object.entries(environments)) {
    const references = bindings[environment];
    for(const role of ['admin','storefront']) {
      const suffix = `${role==='admin' ? 'admin.' : ''}${definition.suffix}`;
      const rule = hostRule(suffix);
      const priority = role==='admin' ? 10 : 1;
      const name = `celebix-tenant-${definition.name}-${role}`;
      const service = definition[role];
      const base = ['gzip@docker',...(role==='storefront' ? [references.storefrontAuthorityMiddleware] : [])];
      routers[`${name}-http`] = {entryPoints:['http'],ruleSyntax:'v3',rule,priority,service,middlewares:['celebix-tenant-https@file']};
      routers[`${name}-https`] = {entryPoints:['https'],ruleSyntax:'v3',rule,priority,service,middlewares:base,tls:{}};
      const paths = role==='admin' ? ['/api/merchant-login/start','/api/merchant-login/resend','/api/merchant-login/bind/start','/api/merchant-login/bind/resend'] : ['/api/account/auth/start'];
      const pathRule = paths.map(path => `Path(\`${path}\`)`).join(' || ');
      routers[`${name}-otp`] = {entryPoints:['https'],ruleSyntax:'v3',rule:`(${rule}) && Method(\`POST\`) && (${pathRule})`,priority:10010,service,
        middlewares:[...base,role==='admin' ? references.adminOtpMiddleware : references.storefrontOtpMiddleware],tls:{}};
    }
  }
  // Unknown hosts still pass through the applications' exact database-backed
  // host gates. This file must never manufacture host or tenant authority.
  return {http:{routers,middlewares:{'celebix-tenant-https':{redirectScheme:{scheme:'https',permanent:true}}}}};
}

if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  try {
    if(process.argv.length!==4 || process.argv[2]!=='--bindings') invalid();
    const source = readFileSync(process.argv[3]);
    if(source.length>16384) invalid();
    const configuration = createTenantWildcardRoutes(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(source)));
    process.stdout.write(JSON.stringify(configuration,null,2)+'\n');
  } catch {
    process.stderr.write(JSON.stringify({ok:false,code:'tenant_wildcard_routes_invalid'})+'\n');
    process.exitCode = 1;
  }
}
