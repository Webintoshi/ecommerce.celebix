import assert from 'node:assert/strict';
import test from 'node:test';
import {createTenantWildcardRoutes, RESERVED_PLATFORM_LABELS, TENANT_WILDCARD_BINDINGS} from './tenant-wildcard-routes.mjs';

const bindings = () => ({
  staging_net:{storefrontAuthorityMiddleware:'celebix-storefront-authority-h55zoba9jh6ij8g6irpqzd9i@docker',adminOtpMiddleware:'celebix-admin-login-ingress-auth@file',storefrontOtpMiddleware:'celebix-admin-login-ingress-auth@file'},
  staging:{storefrontAuthorityMiddleware:'celebix-storefront-authority-vtc2aah63jbqnmtxmvykn6jl@docker',adminOtpMiddleware:'celebix-admin-login-ingress-auth@file',storefrontOtpMiddleware:'celebix-admin-login-ingress-auth@file'},
});
const suffixes = {net:'saas-staging.celebix.net',site:'saas-staging.celebix.site'};
const routerName = (environment,role,kind) => `celebix-tenant-${environment}-${role}-${kind}`;
function matchesHost(rule,hostname) {
  const expressions = [...rule.matchAll(/HostRegexp\(`([^`]+)`\)/g)];
  assert.equal(expressions.length,1);
  const excluded = [...rule.matchAll(/!Host\(`([^`]+)`\)/g)].map(match => match[1]);
  return new RegExp(expressions[0][1]).test(hostname) && !excluded.includes(hostname);
}

test('NET and SITE routers retain exact existing shared service identities and bounded priorities',() => {
  const configuration = createTenantWildcardRoutes(bindings());
  assert.equal(Object.keys(configuration.http.routers).length,12);
  const services = {
    net:{admin:'https-0-e4xe74cmii7jucbkyor0o412@docker',storefront:'https-0-h55zoba9jh6ij8g6irpqzd9i@docker'},
    site:{admin:'https-0-yk1h6d97z7ex0h74ok3zrj5c@docker',storefront:'https-0-vtc2aah63jbqnmtxmvykn6jl@docker'},
  };
  for (const environment of ['net','site']) for (const role of ['admin','storefront']) {
    const regular = configuration.http.routers[routerName(environment,role,'https')];
    const cleartext = configuration.http.routers[routerName(environment,role,'http')];
    const otp = configuration.http.routers[routerName(environment,role,'otp')];
    assert.equal(regular.service,services[environment][role]);
    assert.equal(cleartext.service,regular.service);
    assert.equal(otp.service,regular.service);
    assert.equal(regular.priority,role==='admin' ? 10 : 1);
    assert.equal(cleartext.priority,regular.priority);
    assert.equal(otp.priority,10010);
    assert.ok(regular.priority<20 && regular.priority<100,'existing exact routers outrank generic page routers');
    assert.deepEqual(regular.entryPoints,['https']);
    for(const router of [regular,cleartext,otp]) assert.equal(router.ruleSyntax,'v3');
    assert.deepEqual(regular.tls,{});
    assert.deepEqual(otp.tls,{});
  }
  assert.equal(configuration.http.services,undefined,'never create a tenant backend or fallback service');
  assert.equal(configuration.tls,undefined,'certificate management is a separate file');
});

test('anchored rules cover one valid DNS label in exactly the intended environment and role',() => {
  const {routers} = createTenantWildcardRoutes(bindings()).http;
  for (const environment of ['net','site']) for (const role of ['admin','storefront']) {
    const rule = routers[routerName(environment,role,'https')].rule;
    const suffix = `${role==='admin' ? 'admin.' : ''}${suffixes[environment]}`;
    for (const label of ['a','hizli-kutu','butik-siora','9-store','a'.repeat(63)]) assert.equal(matchesHost(rule,`${label}.${suffix}`),true);
    for (const host of [suffix,`nested.shop.${suffix}`,`-shop.${suffix}`,`shop-.${suffix}`,`a_b.${suffix}`,`${'a'.repeat(64)}.${suffix}`,`shop.${suffix}.evil.test`,`evilshopX${suffix}`,`shop.${suffix}:443`,`SHOP.${suffix}`]) assert.equal(matchesHost(rule,host),false,host);
    const other = environment==='net' ? 'site' : 'net';
    assert.equal(matchesHost(rule,`shop.${role==='admin' ? 'admin.' : ''}${suffixes[other]}`),false);
    if(role==='storefront') assert.equal(matchesHost(rule,`shop.admin.${suffixes[environment]}`),false);
    else assert.equal(matchesHost(rule,`shop.${suffixes[environment]}`),false);
  }
});

test('reserved platform hosts cannot enter a generic router even when exact routers are absent',() => {
  const {routers} = createTenantWildcardRoutes(bindings()).http;
  assert.ok(RESERVED_PLATFORM_LABELS.includes('owner'));
  for (const environment of ['net','site']) for (const role of ['admin','storefront']) for (const kind of ['http','https','otp']) {
    const suffix = `${role==='admin' ? 'admin.' : ''}${suffixes[environment]}`;
    for (const label of RESERVED_PLATFORM_LABELS) assert.equal(matchesHost(routers[routerName(environment,role,kind)].rule,`${label}.${suffix}`),false);
  }
});

test('every cleartext path redirects to HTTPS and never invokes an application or OTP middleware first',() => {
  const {routers,middlewares} = createTenantWildcardRoutes(bindings()).http;
  assert.deepEqual(middlewares,{'celebix-tenant-https':{redirectScheme:{scheme:'https',permanent:true}}});
  for(const [name,router] of Object.entries(routers).filter(([name]) => name.endsWith('-http'))) {
    assert.deepEqual(router.entryPoints,['http'],name);
    assert.deepEqual(router.middlewares,['celebix-tenant-https@file']);
    assert.equal(router.tls,undefined);
    assert.equal(/Path|Method/.test(router.rule),false);
  }
});

test('high-priority OTP rules match only the original exact paths and reuse trusted ingress and authority chains',() => {
  const input = bindings(),{routers} = createTenantWildcardRoutes(input).http;
  for (const environment of ['net','site']) for (const role of ['admin','storefront']) {
    const references = input[environment==='net' ? 'staging_net' : 'staging'];
    const normal = routers[routerName(environment,role,'https')];
    const otp = routers[routerName(environment,role,'otp')];
    const paths = [...otp.rule.matchAll(/Path\(`([^`]+)`\)/g)].map(match => match[1]);
    assert.deepEqual(paths,role==='admin' ? ['/api/merchant-login/start','/api/merchant-login/resend','/api/merchant-login/bind/start','/api/merchant-login/bind/resend'] : ['/api/account/auth/start']);
    assert.match(otp.rule,/Method\(`POST`\)/);
    assert.doesNotMatch(otp.rule,/PathPrefix/);
    assert.deepEqual(normal.middlewares,role==='admin' ? ['gzip@docker'] : ['gzip@docker',references.storefrontAuthorityMiddleware]);
    assert.deepEqual(otp.middlewares,[...normal.middlewares,role==='admin' ? references.adminOtpMiddleware : references.storefrontOtpMiddleware]);
    assert.equal(otp.rule.startsWith(`(${normal.rule}) && `),true);
  }
});

test('unregistered well-formed hosts reach the shared application gate with no default-tenant authority',() => {
  const configuration = createTenantWildcardRoutes(bindings());
  for (const environment of ['net','site']) for (const role of ['admin','storefront']) {
    const router = configuration.http.routers[routerName(environment,role,'https')];
    assert.equal(matchesHost(router.rule,`never-registered.${role==='admin' ? 'admin.' : ''}${suffixes[environment]}`),true);
    assert.equal(router.service.endsWith('@docker'),true);
  }
  const serialized = JSON.stringify(configuration);
  assert.doesNotMatch(serialized,/storeId|storeSlug|defaultTenant|customRequestHeaders|headers|certResolver|certificates|acme|loadBalancer/i);
  // Database-backed unknown-host denial belongs to each existing application's
  // host gate; routing must preserve that check rather than fabricate authority.
});

test('bindings are strict, deterministic, unmodified and reject middleware/provider injection',() => {
  const input = bindings(),before = structuredClone(input);
  assert.deepEqual(TENANT_WILDCARD_BINDINGS,input);
  assert.equal(Object.isFrozen(TENANT_WILDCARD_BINDINGS),true);
  for(const environment of ['staging_net','staging']) assert.equal(Object.isFrozen(TENANT_WILDCARD_BINDINGS[environment]),true);
  assert.deepEqual(createTenantWildcardRoutes(input),createTenantWildcardRoutes(input));
  assert.deepEqual(input,before);
  for(const invalid of [null,{},[],{...input,production:input.staging}, {staging:input.staging}, {...input,staging:{...input.staging,service:'different@docker'}}, {...input,staging:null}]) assert.throws(() => createTenantWildcardRoutes(invalid),/tenant_wildcard_routes_invalid/);
  for(const value of ['',null,{},'gzip@docker','bad@internal','https://evil.test','name@file\nrouters:', 'name with spaces@docker','name@docker@file','different-but-valid@docker','celebix-admin-login-ingress-auth@docker']) {
    for(const field of ['storefrontAuthorityMiddleware','adminOtpMiddleware','storefrontOtpMiddleware']) assert.throws(() => createTenantWildcardRoutes({...input,staging:{...input.staging,[field]:value}}),/tenant_wildcard_routes_invalid/);
  }
  assert.throws(() => createTenantWildcardRoutes({...input,staging:{...input.staging,storefrontAuthorityMiddleware:input.staging_net.storefrontAuthorityMiddleware}}),/tenant_wildcard_routes_invalid/);
});
