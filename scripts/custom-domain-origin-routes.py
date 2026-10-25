#!/usr/bin/env python3
"""Render exact custom-host routes to the existing shared Traefik services.

This module has no database, provider, filesystem or publication side effects.
The caller must supply a complete, eligible native domain snapshot and confirm
that the referenced services and middleware exist before publishing its output.
"""

import ipaddress
import json
import re
import sys
import uuid


MAX_ROWS = 1000
MAX_INPUT_BYTES = 1024 * 1024
ERROR_CODE = "custom_domain_origin_routes_invalid"
_FIELDS = frozenset(("id", "hostname", "role", "platform_hostname"))
_LABEL = re.compile(r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?", re.ASCII)
_RESERVED_LABELS = frozenset((
    "admin", "api", "assets", "auth", "cdn", "ecommerce", "media",
    "owner", "panel", "status", "support", "www",
))
_REDIRECT = "celebix-custom-domain-https"
_INGRESS_AUTH = "celebix-admin-login-ingress-auth@file"

# These identities and chains match tenant-wildcard-routes.mjs. They select
# existing services only; custom input cannot supply a backend or middleware.
_ENVIRONMENTS = {
    "saas-staging.celebix.net": {
        "admin": "https-0-e4xe74cmii7jucbkyor0o412@docker",
        "storefront": "https-0-h55zoba9jh6ij8g6irpqzd9i@docker",
        "authority": "celebix-storefront-authority-h55zoba9jh6ij8g6irpqzd9i@docker",
    },
    "saas-staging.celebix.site": {
        "admin": "https-0-yk1h6d97z7ex0h74ok3zrj5c@docker",
        "storefront": "https-0-vtc2aah63jbqnmtxmvykn6jl@docker",
        "authority": "celebix-storefront-authority-vtc2aah63jbqnmtxmvykn6jl@docker",
    },
}
_OTP_PATHS = {
    "admin": (
        "/api/merchant-login/start", "/api/merchant-login/resend",
        "/api/merchant-login/bind/start", "/api/merchant-login/bind/resend",
    ),
    "storefront": ("/api/account/auth/start",),
}


def _invalid():
    raise ValueError(ERROR_CODE)


def _hostname(value):
    if type(value) is not str or not value.isascii() or not 1 <= len(value) <= 253:
        _invalid()
    labels = value.split(".")
    if len(labels) < 2 or any(_LABEL.fullmatch(label) is None for label in labels):
        _invalid()
    try:
        ipaddress.ip_address(value)
    except ValueError:
        return value
    _invalid()


def _environment(platform_hostname, role):
    platform_hostname = _hostname(platform_hostname)
    for suffix, definition in _ENVIRONMENTS.items():
        role_suffix = "." + ("admin." if role == "admin" else "") + suffix
        if platform_hostname.endswith(role_suffix):
            label = platform_hostname[:-len(role_suffix)]
            if _LABEL.fullmatch(label) is not None and label not in _RESERVED_LABELS:
                return definition
    _invalid()


def create_custom_domain_routes(rows):
    """Validate a native snapshot and return a deterministic file-provider config.

    Each row has exactly id, hostname, role and platform_hostname. Platform
    hostnames select a reviewed environment; original custom hosts are retained
    in every rule. Native application gates remain responsible for tenant access.
    """
    if type(rows) is not list or len(rows) > MAX_ROWS:
        _invalid()
    validated = []
    seen_ids = set()
    seen_hosts = set()
    for row in rows:
        if type(row) is not dict or frozenset(row) != _FIELDS:
            _invalid()
        identifier = row["id"]
        if type(identifier) is not str:
            _invalid()
        try:
            parsed_id = uuid.UUID(identifier)
        except ValueError:
            _invalid()
        if str(parsed_id) != identifier:
            _invalid()
        role = row["role"]
        if type(role) is not str or role not in _OTP_PATHS:
            _invalid()
        hostname = _hostname(row["hostname"])
        if any(hostname == suffix or hostname.endswith("." + suffix)
               for suffix in ("celebix.net", "celebix.site")):
            _invalid()
        definition = _environment(row["platform_hostname"], role)
        if identifier in seen_ids or hostname in seen_hosts:
            _invalid()
        seen_ids.add(identifier)
        seen_hosts.add(hostname)
        validated.append((identifier, role, hostname, definition))

    routers = {}
    for identifier, role, hostname, definition in sorted(validated, key=lambda item: item[:2]):
        name = "celebix-custom-origin-" + role + "-" + identifier.replace("-", "")
        rule = "Host(`" + hostname + "`)"
        service = definition[role]
        base = ["gzip@docker"]
        if role == "storefront":
            base.append(definition["authority"])
        routers[name + "-http"] = {
            "entryPoints": ["http"], "ruleSyntax": "v3", "rule": rule,
            "priority": 15, "service": service, "middlewares": [_REDIRECT + "@file"],
        }
        routers[name + "-https"] = {
            "entryPoints": ["https"], "ruleSyntax": "v3", "rule": rule,
            "priority": 15, "service": service, "middlewares": list(base), "tls": {},
        }
        path_rule = " || ".join("Path(`" + path + "`)" for path in _OTP_PATHS[role])
        routers[name + "-otp"] = {
            "entryPoints": ["https"], "ruleSyntax": "v3",
            "rule": "(" + rule + ") && Method(`POST`) && (" + path_rule + ")",
            "priority": 10015, "service": service,
            "middlewares": base + [_INGRESS_AUTH], "tls": {},
        }
    return {"http": {"routers": routers, "middlewares": {
        _REDIRECT: {"redirectScheme": {"scheme": "https", "permanent": True}},
    }}}


def _unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            _invalid()
        result[key] = value
    return result


def main():
    try:
        if len(sys.argv) != 1:
            _invalid()
        source = sys.stdin.buffer.read(MAX_INPUT_BYTES + 1)
        if len(source) > MAX_INPUT_BYTES:
            _invalid()
        rows = json.loads(source.decode("utf-8", errors="strict"), object_pairs_hook=_unique_object)
        config = create_custom_domain_routes(rows)
        sys.stdout.write(json.dumps(config, sort_keys=True, separators=(",", ":")) + "\n")
        return 0
    except Exception:
        sys.stderr.write(json.dumps({"ok": False, "code": ERROR_CODE}) + "\n")
        return 1


if __name__ == "__main__":
    sys.exit(main())
