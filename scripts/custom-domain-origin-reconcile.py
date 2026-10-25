#!/usr/bin/env python3
"""Bounded host-side projection of native custom domains into shared ingress.

No credentials, Cloudflare writes, tenant state transitions or app restarts.
Install beside custom-domain-origin-routes.py; --check is read-only, --apply
owns exactly one dynamic proxy file. Errors never include DB/container output.
"""
import fcntl
import hashlib
import importlib.util
import json
import os
import pathlib
import stat
import subprocess
import sys
import tempfile


DESTINATION = pathlib.Path("/data/coolify/proxy/dynamic/celebix-custom-domain-origin-routes.yaml")
LOCK = "/tmp/celebix-content-authoring-release-20260929-lock/release.lock"
DB_CONTAINER = "ta8qw4jkvedkap7qqdakrb7y"
DATABASE = "celebix_saas_staging_auth01"
MAX_BYTES = 1_048_576
APP_PREFIXES = {
    "net_admin": "e4xe74cmii7jucbkyor0o412",
    "net_storefront": "h55zoba9jh6ij8g6irpqzd9i",
    "site_admin": "yk1h6d97z7ex0h74ok3zrj5c",
    "site_storefront": "vtc2aah63jbqnmtxmvykn6jl",
}
DOMAIN_QUERY = """
BEGIN READ ONLY;
SET LOCAL statement_timeout='3s';
SET LOCAL lock_timeout='250ms';
WITH eligible AS (
 SELECT d.id,d.hostname,'storefront'::text AS role,
  (SELECT CASE WHEN count(*)=1 THEN min(f.hostname) END
   FROM saas.store_domains f WHERE f.store_id=d.store_id
    AND f.hostname_type='platform_subdomain' AND f.status='active'
    AND f.verified_at<=clock_timestamp()) AS platform_hostname
 FROM saas.store_domains d JOIN saas.store_domain_provisioning p ON p.domain_id=d.id AND p.store_id=d.store_id
 JOIN saas.stores s ON s.id=d.store_id AND s.status='active'
 WHERE d.hostname_type='custom_domain' AND d.status IN ('pending','active')
  AND d.created_at<=clock_timestamp() AND p.provider='cloudflare_for_saas'
  AND p.provider_hostname_id IS NOT NULL AND NOT p.requested_removal
  AND p.hostname_status<>'deleted'
 UNION ALL
 SELECT p.id,p.hostname,'admin'::text AS role,
  (SELECT CASE WHEN count(*)=1 THEN min(f.hostname) END
   FROM saas.admin_domains f WHERE f.store_id=p.store_id
    AND f.kind='platform_subdomain' AND f.status='active'
    AND f.verified_at<=clock_timestamp()) AS platform_hostname
 FROM saas.admin_domains p JOIN saas.stores s ON s.id=p.store_id AND s.status='active'
 WHERE p.kind='custom_alias' AND p.status IN ('pending_verification','active')
  AND p.created_at<=clock_timestamp() AND p.provider='cloudflare_for_saas'
  AND p.provider_hostname_id IS NOT NULL AND NOT p.requested_removal
  AND p.hostname_status<>'deleted'
), bounded AS (SELECT * FROM eligible ORDER BY hostname,id LIMIT 1001)
SELECT COALESCE(json_agg(row_to_json(bounded) ORDER BY hostname,id),'[]'::json)::text FROM bounded;
COMMIT;
"""


def command(args, *, timeout=8):
    result = subprocess.run(args, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                            stderr=subprocess.DEVNULL, check=True, timeout=timeout)
    if len(result.stdout) > MAX_BYTES:
        raise ValueError("origin_snapshot_too_large")
    return result.stdout


def load_generator():
    path = pathlib.Path(__file__).with_name("custom-domain-origin-routes.py")
    spec = importlib.util.spec_from_file_location("custom_domain_origin_routes", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.create_custom_domain_routes


def read_rows():
    raw = command(["docker", "exec", DB_CONTAINER, "psql", "-U", "postgres", "-d", DATABASE,
                   "-X", "--quiet", "--tuples-only", "--no-align", "-v", "ON_ERROR_STOP=1", "-c", DOMAIN_QUERY])
    return json.loads(raw)


def dependencies_ready():
    # Inspect names first, then only the four relevant app descriptors. These
    # private descriptors contain secrets: never print/forward them on error.
    names = command(["docker", "ps", "--format", "{{.Names}}"]).decode().splitlines()
    selected = []
    for prefix in APP_PREFIXES.values():
        matches = [name for name in names if name == prefix or name.startswith(prefix + "-")]
        if len(matches) != 1:
            raise ValueError("origin_dependencies_unavailable")
        selected.append(matches[0])
    descriptors = json.loads(command(["docker", "inspect", *selected]))
    for name, descriptor in zip(APP_PREFIXES, descriptors):
        prefix = APP_PREFIXES[name]
        labels = descriptor["Config"]["Labels"] or {}
        state = descriptor["State"]
        # Customer Panel has no Docker HEALTHCHECK; running is its existing
        # container contract. If a service declares health, require it healthy.
        if state.get("Status") != "running" or ("Health" in state and state["Health"].get("Status") != "healthy"):
            raise ValueError("origin_dependencies_unavailable")
        port = labels.get(f"traefik.http.services.https-0-{prefix}.loadbalancer.server.port")
        if str(port) != ("3400" if name.endswith("admin") else "3450"):
            raise ValueError("origin_dependencies_unavailable")
        if name.endswith("storefront"):
            authority = f"traefik.http.middlewares.celebix-storefront-authority-{prefix}.headers.customrequestheaders."
            headers = {key[len(authority):].lower(): value for key, value in labels.items() if key.startswith(authority)}
            if not headers.get("x-celebix-storefront-proxy", "").startswith("p1."):
                raise ValueError("origin_dependencies_unavailable")
    auth_path = DESTINATION.parent / "celebix-admin-login-ip.yaml"
    auth = auth_path.read_bytes()
    if len(auth) > 32_768 or b"celebix-admin-login-ingress-auth" not in auth:
        raise ValueError("origin_dependencies_unavailable")


def publication_lock():
    pid = int(command(["docker", "inspect", "--format", "{{.State.Pid}}", "coolify"]).strip())
    if pid < 2:
        raise ValueError("origin_publication_lock_unavailable")
    descriptor = os.open(f"/proc/{pid}/root{LOCK}", os.O_RDWR | os.O_NOFOLLOW)
    try:
        if not stat.S_ISREG(os.fstat(descriptor).st_mode):
            raise ValueError("origin_publication_lock_unavailable")
        fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BaseException:
        os.close(descriptor)
        raise
    return descriptor


def atomic_publish(destination, content):
    if destination.is_symlink():
        raise ValueError("origin_destination_invalid")
    if destination.exists() and destination.read_bytes() == content:
        return False
    descriptor, temporary = tempfile.mkstemp(prefix=".celebix-custom-origin-", suffix=".tmp", dir=destination.parent)
    try:
        with os.fdopen(descriptor, "wb") as staged:
            staged.write(content)
            staged.flush()
            os.fchmod(staged.fileno(), 0o644)
            os.fsync(staged.fileno())
        os.replace(temporary, destination)
        directory = os.open(destination.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
        return True
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def main(argv):
    if argv not in (["--check"], ["--apply"]):
        raise ValueError("origin_arguments_invalid")
    descriptor = publication_lock()
    try:
        dependencies_ready()
        rows = read_rows()
        config = load_generator()(rows)
        content = (json.dumps(config, ensure_ascii=True, indent=2, sort_keys=True) + "\n").encode()
        if len(content) > 4_194_304:
            raise ValueError("origin_configuration_too_large")
        changed = atomic_publish(DESTINATION, content) if argv == ["--apply"] else False
        return {"ok": True, "mode": argv[0][2:], "domains": len(rows), "changed": changed,
                "sha256": hashlib.sha256(content).hexdigest()}
    finally:
        os.close(descriptor)


if __name__ == "__main__":
    try:
        print(json.dumps(main(sys.argv[1:]), sort_keys=True))
    except BlockingIOError:
        print(json.dumps({"ok": True, "deferred": "publication_busy"}))
    except BaseException:
        print(json.dumps({"ok": False, "code": "custom_domain_origin_reconcile_failed"}))
        sys.exit(1)
