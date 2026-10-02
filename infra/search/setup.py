#!/usr/bin/env python3
"""Prepare one private engine and persist both shared app environments; never deploy apps."""
import argparse
import ipaddress
import json
import os
from pathlib import Path
import re
import secrets
import socket
import stat
import subprocess
import time
from datetime import datetime, timezone
import urllib.error
import urllib.parse
import urllib.request
import uuid

EXPECTED_HOST = "WEBINTOSH"
APPLICATIONS = {"site": "vtc2aah63jbqnmtxmvykn6jl", "net": "h55zoba9jh6ij8g6irpqzd9i"}
SERVICE = "celebix-catalog-search"
NETWORK = "coolify"
INDEX = "celebix_products_v1"
SEARCH_URL = "http://celebix-catalog-search:7700"
IMAGE = "getmeili/meilisearch:v1.54.3@sha256:e68913ab7d6f5b159529e472cfd362ce3c741fafd3c127961b2142abbe41b3c9"
COMPOSE = Path(__file__).with_name("compose.yaml")
LOCAL_CLI = Path(__file__).with_name("coolify-local.php")
REPO = Path(__file__).resolve().parents[2]
SETTINGS = {
    "displayedAttributes": ["storeId", "productId"],
    "searchableAttributes": ["skus", "barcodes", "searchText", "title"],
    "filterableAttributes": ["storeId", "skus", "barcodes"],
    "sortableAttributes": [],
    "rankingRules": ["words", "typo", "proximity", "attribute", "sort", "exactness"],
    "typoTolerance": {"disableOnAttributes": ["skus", "barcodes"]},
    "pagination": {"maxTotalHits": 10000},
}
WRITE_ACTIONS = ["indexes.get", "indexes.create", "settings.update", "documents.add", "documents.delete", "tasks.get"]
ENV_KEYS = {"CELEBIX_SEARCH_URL", "CELEBIX_SEARCH_API_KEY", "CELEBIX_SEARCH_WRITE_API_KEY", "CELEBIX_SEARCH_INDEX", "CELEBIX_SEARCH_WORKER_ENABLED"}
CLI_ERRORS = {"local_cli_request_refused", "local_cli_write_not_allowed", "wrong_shared_application", "shared_application_auto_deploy_enabled", "global_deployment_queue_busy", "other_environment_changed", "environment_verification_failed"}


class SetupError(Exception):
    pass


class ApiError(SetupError):
    def __init__(self, status):
        self.status = status
        super().__init__("private_api_http_" + str(status))


def private_path(path):
    path = Path(path).absolute()
    if path.is_symlink() or any(parent.is_symlink() for parent in path.parents):
        raise SetupError("unsafe_secret_file")
    if path.exists() and not path.is_file():
        raise SetupError("unsafe_secret_file")
    return path


def read_private(path):
    path = private_path(path)
    descriptor = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
    with os.fdopen(descriptor, "r") as handle:
        metadata = os.fstat(handle.fileno())
        if metadata.st_uid != os.geteuid() or metadata.st_mode & 0o077:
            raise SetupError("secret_file_not_private")
        value = handle.read(65537)
    if len(value) > 65536:
        raise SetupError("secret_file_too_large")
    return value


def write_private(path, value):
    path = private_path(path)
    temporary = path.with_name(path.name + "." + uuid.uuid4().hex + ".tmp")
    descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(descriptor, "w") as handle:
            handle.write(value)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def prepare_secrets(root):
    root = Path(root).absolute()
    if root.is_symlink() or any(parent.is_symlink() for parent in root.parents) or root.is_relative_to(REPO):
        raise SetupError("unsafe_secret_directory")
    root.mkdir(mode=0o700, parents=True, exist_ok=True)
    if root.stat().st_uid != os.geteuid():
        raise SetupError("secret_directory_wrong_owner")
    root.chmod(0o700)
    master_path = private_path(root / "master.key")
    if not master_path.exists():
        write_private(master_path, secrets.token_hex(32) + "\n")
    master = read_private(master_path).strip()
    if len(master) < 32 or not master.isascii() or not master.isalnum():
        raise SetupError("invalid_master_key")
    uid_path = private_path(root / "key-uids.json")
    if not uid_path.exists():
        write_private(uid_path, json.dumps({kind: str(uuid.uuid4()) for kind in ("search", "write")}) + "\n")
    try:
        uids = json.loads(read_private(uid_path))
        if set(uids) != {"search", "write"} or any(uuid.UUID(value).version != 4 for value in uids.values()) or uids["search"] == uids["write"]:
            raise ValueError()
    except (ValueError, TypeError, AttributeError):
        raise SetupError("invalid_key_uids") from None
    return {"master": master, "uids": uids}


def validate_coolify_origin(origin):
    parsed = urllib.parse.urlsplit(origin)
    if parsed.scheme != "http" or parsed.hostname not in ("127.0.0.1", "localhost", "::1") or parsed.username or parsed.password or parsed.path not in ("", "/") or parsed.query or parsed.fragment:
        raise SetupError("unsafe_coolify_origin")
    try:
        if parsed.port not in (8000,):
            raise SetupError("unsafe_coolify_origin")
    except ValueError:
        raise SetupError("unsafe_coolify_origin") from None
    return origin.rstrip("/")


def validate_host(host):
    if host.split(".", 1)[0] != EXPECTED_HOST:
        raise SetupError("wrong_target_host")


def validate_application(application, app_id):
    if not isinstance(application, dict) or application.get("uuid") != app_id or "storefront-shared" not in str(application.get("build_command", "")):
        raise SetupError("wrong_shared_application")


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, response, code, message, headers, target):
        return None


class JsonApi:
    def __init__(self, origin, token, prefix=""):
        self.origin, self.token, self.prefix = origin, token, prefix
        self.opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())

    def __call__(self, method, route, body=None):
        if not route.startswith("/") or any(character in route for character in ("\r", "\n", "#")):
            raise SetupError("invalid_private_api_route")
        payload = None if body is None else json.dumps(body).encode()
        request = urllib.request.Request(self.origin + self.prefix + route, data=payload, method=method,
            headers={"Authorization": "Bearer " + self.token, "Content-Type": "application/json"})
        try:
            with self.opener.open(request, timeout=15) as response:
                data = response.read(2 * 1024 * 1024 + 1)
            if len(data) > 2 * 1024 * 1024:
                raise SetupError("private_api_response_too_large")
            return json.loads(data) if data else None
        except urllib.error.HTTPError as error:
            raise ApiError(error.code) from None
        except (urllib.error.URLError, TimeoutError, OSError, ValueError):
            raise SetupError("private_api_unavailable") from None


def docker(*arguments, environment=None, input_text=None):
    try:
        result = subprocess.run(["docker", *arguments], check=True, capture_output=True, text=True,
            timeout=120, env=environment, input=input_text)
        return result.stdout.strip()
    except (subprocess.SubprocessError, OSError):
        # Docker and API responses can contain sensitive values; never print their text.
        raise SetupError("docker_operation_failed") from None


def validate_local_cli_request(method, route, body, writable):
    allowed_routes = {"/applications/" + app_id + suffix for app_id in APPLICATIONS.values() for suffix in ("", "/envs", "/envs/bulk")}
    if route not in allowed_routes or method not in ("GET", "PATCH") or (method == "GET" and route.endswith("/bulk")) or (method == "PATCH" and not route.endswith("/envs/bulk")):
        raise SetupError("local_cli_request_refused")
    if method == "GET":
        if body is not None:
            raise SetupError("local_cli_request_refused")
        return
    if not writable:
        raise SetupError("local_cli_write_not_allowed")
    if not isinstance(body, dict) or set(body) != {"data"} or not isinstance(body["data"], list) or not 1 <= len(body["data"]) <= len(ENV_KEYS):
        raise SetupError("local_cli_request_refused")
    seen = set()
    flags = {"is_literal": True, "is_buildtime": False, "is_runtime": True, "is_multiline": False, "is_preview": False}
    for entry in body["data"]:
        if not isinstance(entry, dict) or set(entry) != {"key", "value", *flags} or entry["key"] not in ENV_KEYS or entry["key"] in seen or any(entry.get(key) is not value for key, value in flags.items()) or not isinstance(entry["value"], str):
            raise SetupError("local_cli_request_refused")
        seen.add(entry["key"])
        key, value = entry["key"], entry["value"]
        if (key == "CELEBIX_SEARCH_URL" and value != SEARCH_URL) or (key == "CELEBIX_SEARCH_INDEX" and value != INDEX) or (key == "CELEBIX_SEARCH_WORKER_ENABLED" and value not in ("true", "false")):
            raise SetupError("local_cli_request_refused")
        if key in ("CELEBIX_SEARCH_API_KEY", "CELEBIX_SEARCH_WRITE_API_KEY") and not (key == "CELEBIX_SEARCH_WRITE_API_KEY" and value == "") and not re.fullmatch(r"[A-Za-z0-9_-]{16,256}", value):
            raise SetupError("local_cli_request_refused")


class CoolifyLocalCli:
    """Exact shared-app operations through captured local Laravel CLI JSON pipes."""
    def __init__(self, writable=False, execute=docker):
        self.writable, self.execute = writable, execute

    def __call__(self, method, route, body=None):
        validate_local_cli_request(method, route, body, self.writable)
        program = LOCAL_CLI.read_text().removeprefix("<?php\n")
        request = json.dumps({"method": method, "route": route, "body": body, "writeAllowed": self.writable})
        output = self.execute("exec", "-i", "coolify", "php", "-r", program, input_text=request)
        try:
            response = json.loads(output)
        except (ValueError, TypeError):
            raise SetupError("coolify_local_cli_failed") from None
        if not isinstance(response, dict) or response.get("ok") is not True:
            code = response.get("code") if isinstance(response, dict) else None
            raise SetupError(code if code in CLI_ERRORS else "coolify_local_cli_failed")
        return response.get("data")


def preflight(coolify):
    validate_host(socket.gethostname())
    if os.environ.get("DOCKER_HOST") or os.environ.get("DOCKER_CONTEXT"):
        raise SetupError("unexpected_docker_context")
    if docker("context", "inspect", "--format", "{{.Endpoints.docker.Host}}") != "unix:///var/run/docker.sock":
        raise SetupError("unexpected_docker_context")
    if docker("network", "inspect", NETWORK, "--format", "{{.Name}} {{.Driver}}") != "coolify bridge":
        raise SetupError("shared_network_missing")
    for app_id in APPLICATIONS.values():
        validate_application(coolify("GET", "/applications/" + app_id), app_id)


def wait_task(api, result):
    task = result.get("taskUid") if isinstance(result, dict) else None
    if not isinstance(task, int) or isinstance(task, bool):
        raise SetupError("invalid_meilisearch_task")
    for _ in range(60):
        state = api("GET", "/tasks/" + str(task))
        if state.get("status") == "succeeded":
            return
        if state.get("status") in ("failed", "canceled"):
            raise SetupError("meilisearch_task_failed")
        time.sleep(1)
    raise SetupError("meilisearch_task_timeout")


def key_definition(kind, uid):
    return {"uid": uid, "name": "Celebix catalog " + kind,
        "description": "Private shared storefront catalog " + kind,
        "actions": ["search"] if kind == "search" else WRITE_ACTIONS,
        "indexes": [INDEX], "expiresAt": None}


def bootstrap_index_and_keys(api, root, credentials):
    keys = {}
    for kind in ("search", "write"):
        definition = key_definition(kind, credentials["uids"][kind])
        try:
            key = api("GET", "/keys/" + definition["uid"])
        except ApiError as error:
            if error.status != 404:
                raise
            key = api("POST", "/keys", definition)
        if key.get("uid") != definition["uid"] or sorted(key.get("actions", [])) != sorted(definition["actions"]) or key.get("indexes") != [INDEX] or key.get("expiresAt") is not None:
            raise SetupError("key_scope_mismatch")
        path = private_path(Path(root) / ("search.key" if kind == "search" else "write.key"))
        saved = read_private(path).strip() if path.exists() else None
        returned = key.get("key")
        if saved and returned and saved != returned:
            raise SetupError("saved_key_mismatch")
        value = saved or returned
        if not isinstance(value, str) or not value or len(value) > 1024 or any(character.isspace() or ord(character) < 33 for character in value):
            raise SetupError("scoped_key_recovery_required")
        if not saved:
            write_private(path, value + "\n")
        keys[kind] = value
    route = "/indexes/" + INDEX
    try:
        index = api("GET", route)
        if index.get("uid") != INDEX or index.get("primaryKey") != "id":
            raise SetupError("existing_index_contract_mismatch")
    except ApiError as error:
        if error.status != 404:
            raise
        wait_task(api, api("POST", "/indexes", {"uid": INDEX, "primaryKey": "id"}))
    wait_task(api, api("PATCH", route + "/settings", SETTINGS))
    return keys


def environment_entries(search_key, write_key, enabled):
    values = {"CELEBIX_SEARCH_URL": SEARCH_URL, "CELEBIX_SEARCH_API_KEY": search_key,
        "CELEBIX_SEARCH_WRITE_API_KEY": write_key if enabled else "", "CELEBIX_SEARCH_INDEX": INDEX,
        "CELEBIX_SEARCH_WORKER_ENABLED": "true" if enabled else "false"}
    return [{"key": key, "value": value, "is_literal": True, "is_buildtime": False,
        "is_runtime": True, "is_multiline": False, "is_preview": False} for key, value in values.items()]


def wire_applications(coolify, search_key, write_key, worker="site"):
    changed = []
    for role, app_id in APPLICATIONS.items():
        route = "/applications/" + app_id
        entries = environment_entries(search_key, write_key, worker in (role, "both"))
        current = coolify("GET", route + "/envs")
        if isinstance(current, dict):
            current = current.get("data")
        if not isinstance(current, list):
            raise SetupError("invalid_coolify_environment_response")
        current_by_key = {record.get("key"): record for record in current if isinstance(record, dict) and record.get("is_preview", False) is False}
        updates = [entry for entry in entries if any(current_by_key.get(entry["key"], {}).get(key) != value for key, value in entry.items())]
        if updates:
            coolify("PATCH", route + "/envs/bulk", {"data": updates})
            changed.append(app_id)
        # Read back each target; a lost/partial response is safe to retry without app deployment.
        if updates:
            persisted = coolify("GET", route + "/envs")
            if isinstance(persisted, dict):
                persisted = persisted.get("data")
            if not isinstance(persisted, list):
                raise SetupError("coolify_environment_verification_failed")
            saved = {item.get("key"): item for item in persisted if isinstance(item, dict) and item.get("is_preview", False) is False}
            if any(any(saved.get(entry["key"], {}).get(key) != value for key, value in entry.items()) for entry in entries):
                raise SetupError("coolify_environment_verification_failed")
    return changed


def snapshot_environments(coolify, root, api_backend=False):
    snapshots = {}
    for role, app_id in APPLICATIONS.items():
        rows = coolify("GET", "/applications/" + app_id + "/envs")
        if isinstance(rows, dict):
            rows = rows.get("data")
        if not isinstance(rows, list):
            raise SetupError("invalid_coolify_environment_response")
        if api_backend:
            # API keys need sensitive read authority, and creation observers must not add preview rows.
            if any(not isinstance(row, dict) or "value" not in row for row in rows):
                raise SetupError("coolify_sensitive_read_required")
            existing_runtime = {row.get("key") for row in rows if row.get("is_preview") is False}
            existing_preview = {row.get("key") for row in rows if row.get("is_preview") is True}
            if any(key not in existing_runtime and key not in existing_preview for key in ENV_KEYS):
                raise SetupError("use_local_cli_to_preserve_previews")
        snapshots[role] = {"application": app_id, "environment": [row for row in rows if row.get("key") in ENV_KEYS and row.get("is_preview", False) is False]}
    history = Path(root) / "history"
    if history.is_symlink():
        raise SetupError("unsafe_secret_directory")
    history.mkdir(mode=0o700, exist_ok=True)
    history.chmod(0o700)
    target = history / (datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "-" + uuid.uuid4().hex)
    target.mkdir(mode=0o700)
    write_private(target / "coolify-env-before.json", json.dumps(snapshots, sort_keys=True) + "\n")


def run_setup(root, apply=False, token_file=None, coolify_origin="http://127.0.0.1:8000", worker="site", local_cli=False):
    if worker not in ("site", "net", "both", "none"):
        raise SetupError("invalid_worker_target")
    plan = {"mode": "apply" if apply else "plan", "service": SERVICE, "image": IMAGE,
        "applications": list(APPLICATIONS.values()), "worker": worker, "app_deployments": 0,
        "coolify_backend": "local-cli" if local_cli else "api"}
    if not apply:
        return plan
    validate_host(socket.gethostname())
    if local_cli:
        if token_file:
            raise SetupError("conflicting_coolify_backends")
        coolify = CoolifyLocalCli(writable=True)
    else:
        origin = validate_coolify_origin(coolify_origin)
        if not token_file:
            raise SetupError("coolify_token_file_required")
        token = read_private(Path(token_file)).strip()
        if not token or len(token) > 1024 or not token.isascii() or any(character.isspace() or ord(character) < 33 for character in token):
            raise SetupError("invalid_coolify_token")
        coolify = JsonApi(origin, token, "/api/v1")
    preflight(coolify)
    credentials = prepare_secrets(root)
    snapshot_environments(coolify, root, api_backend=not local_cli)
    environment = {**os.environ, "CELEBIX_SEARCH_STATE_DIR": str(Path(root).absolute())}
    docker("compose", "-f", str(COMPOSE), "up", "-d", "--wait", "--wait-timeout", "60", environment=environment)
    ports = json.loads(docker("inspect", SERVICE, "--format", "{{json .NetworkSettings.Ports}}"))
    if any(value for value in (ports or {}).values()):
        raise SetupError("search_port_is_public")
    if docker("inspect", SERVICE, "--format", "{{.Config.Image}}") != IMAGE:
        raise SetupError("search_image_mismatch")
    address = docker("inspect", SERVICE, "--format", "{{(index .NetworkSettings.Networks \"coolify\").IPAddress}}")
    try:
        if not ipaddress.ip_address(address).is_private:
            raise ValueError()
    except ValueError:
        raise SetupError("invalid_private_search_address") from None
    engine = JsonApi("http://" + address + ":7700", credentials["master"])
    if engine("GET", "/health").get("status") != "available":
        raise SetupError("search_health_unavailable")
    keys = bootstrap_index_and_keys(engine, Path(root), credentials)
    plan["updated_applications"] = wire_applications(coolify, keys["search"], keys["write"], worker)
    plan["installed_at_utc"] = datetime.now(timezone.utc).isoformat()
    write_private(Path(root) / "installation-receipt.json", json.dumps(plan, sort_keys=True) + "\n")
    return plan


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="Install/bootstrap engine and persist shared app envs; no app deployment")
    parser.add_argument("--state-dir", type=Path, default=Path("/data/celebix/search"))
    parser.add_argument("--coolify-token-file", type=Path)
    parser.add_argument("--coolify-local-cli", action="store_true", help="Use guarded local Coolify model operations; no API token required")
    parser.add_argument("--coolify-origin", default="http://127.0.0.1:8000")
    parser.add_argument("--worker", choices=("site", "net", "both", "none"), default="site")
    arguments = parser.parse_args()
    try:
        result = run_setup(arguments.state_dir, arguments.apply, arguments.coolify_token_file, arguments.coolify_origin, arguments.worker, arguments.coolify_local_cli)
        print(json.dumps(result, sort_keys=True))
        return 0
    except (SetupError, OSError, ValueError, TypeError):
        # Do not include exception text from files, Docker, API payloads or secret-bearing URLs.
        import sys
        error = sys.exc_info()[1]
        code = str(error) if isinstance(error, SetupError) else "setup_failed"
        print(json.dumps({"status": "failed", "code": code}), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
