import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const routeSource = await readFile(new URL("./route.ts", import.meta.url), "utf8");

test("callback route delegates stage classification to the tested callback flow", () => {
  assert.match(routeSource, /resolveAdminCallback/);
  assert.doesNotMatch(routeSource, /login_failed|unauthorized/);
});

test("callback exchanges the authorization code with the signed PKCE verifier", () => {
  assert.match(routeSource, /exchangeLogtoCodeForTokens\(code, stateCookie\.codeVerifier\)/);
});

test("duplicate callback requests share the signed state result", () => {
  assert.match(routeSource, /resolveAdminCallbackOnce\(/);
  assert.match(routeSource, /stateCookie\.state/);
});

test("successful callback clears only the one-time state cookie before writing the session", () => {
  const successStart = routeSource.indexOf(
    "const response = NextResponse.redirect(buildAdminRedirect(nextPath));",
  );
  const successEnd = routeSource.indexOf("return response;", successStart);
  const successBlock = routeSource.slice(successStart, successEnd);

  assert.match(successBlock, /clearLogtoAdminStateCookie\(response\)/);
  assert.doesNotMatch(successBlock, /clearLogtoAdminSessionCookies\(response\)/);
});

test("callback failure redirects preserve safe next, typed error, and correlation id", () => {
  assert.match(routeSource, /sanitizeInternalRedirectPath/);
  assert.match(routeSource, /nextPath/);
  assert.match(routeSource, /errorCode/);
  assert.match(routeSource, /correlationId/);
  assert.match(routeSource, /randomUUID\(\)/);
});

test("callback logs expose only the safe structured diagnostic fields", () => {
  assert.match(routeSource, /event/);
  assert.match(routeSource, /storeSlug/);
  assert.doesNotMatch(routeSource, /console\.(?:log|error|warn)\([^\n]*(?:tokens|access_token|id_token|\bcode\b)/i);
  assert.doesNotMatch(routeSource, /Logto admin callback failed:/);
});
