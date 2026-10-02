import importlib.util
import json
from pathlib import Path
import tempfile
import unittest


def implementation():
    source = Path(__file__).with_name("setup.py")
    if not source.exists():
        raise AssertionError("The shared search setup implementation is missing")
    spec = importlib.util.spec_from_file_location("shared_search_setup", source)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class SharedSearchSetupTests(unittest.TestCase):
    def test_plan_does_not_create_secrets_or_contact_services(self):
        setup = implementation()
        with tempfile.TemporaryDirectory() as directory:
            result = setup.run_setup(Path(directory) / "state", apply=False)
            self.assertFalse((Path(directory) / "state").exists())
            self.assertEqual(result["applications"], list(setup.APPLICATIONS.values()))
            self.assertEqual(result["mode"], "plan")

    def test_secret_files_are_private_and_reused_without_rotation(self):
        setup = implementation()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve() / "state"
            first = setup.prepare_secrets(root)
            second = setup.prepare_secrets(root)
            self.assertEqual(first, second)
            self.assertGreaterEqual(len(first["master"]), 32)
            self.assertEqual(root.stat().st_mode & 0o777, 0o700)
            for filename in ("master.key", "key-uids.json"):
                self.assertEqual((root / filename).stat().st_mode & 0o777, 0o600)
            (root / "master.key").unlink()
            (root / "master.key").symlink_to(Path(directory) / "elsewhere")
            with self.assertRaisesRegex(setup.SetupError, "unsafe_secret_file"):
                setup.prepare_secrets(root)

    def test_public_control_plane_endpoint_is_rejected(self):
        setup = implementation()
        for origin in ("https://coolify.example.com", "http://127.0.0.1:8000@evil.test", "http://127.0.0.1:8000/api", "http://127.0.0.1:8000?x=1"):
            with self.subTest(origin=origin):
                with self.assertRaisesRegex(setup.SetupError, "unsafe_coolify_origin"):
                    setup.validate_coolify_origin(origin)
        self.assertEqual(setup.validate_coolify_origin("http://127.0.0.1:8000"), "http://127.0.0.1:8000")

    def test_environment_targets_both_shared_apps_with_runtime_only_scoped_keys(self):
        setup = implementation()
        patch_calls = []
        environments = {}

        def request(method, route, body=None):
            if route.endswith("/envs"):
                return environments.get(route, [
                    {"key": "UNRELATED", "value": "keep", "is_preview": False},
                    {"key": "CELEBIX_SEARCH_API_KEY", "value": "preview-key", "is_preview": True},
                ])
            patch_calls.append((method, route, body))
            environments[route.removesuffix("/bulk")] = body["data"]
            return None

        setup.wire_applications(request, "read-key", "write-key", worker="site")
        self.assertEqual(len(patch_calls), 2)
        for role, app_id in setup.APPLICATIONS.items():
            method, route, body = next(call for call in patch_calls if app_id in call[1])
            self.assertEqual(method, "PATCH")
            self.assertEqual(route, "/applications/" + app_id + "/envs/bulk")
            entries = {entry["key"]: entry for entry in body["data"]}
            self.assertNotIn("UNRELATED", entries)
            self.assertEqual(entries["CELEBIX_SEARCH_INDEX"]["value"], "celebix_products_v1")
            self.assertEqual(entries["CELEBIX_SEARCH_API_KEY"]["value"], "read-key")
            self.assertEqual(entries["CELEBIX_SEARCH_WRITE_API_KEY"]["value"], "write-key" if role == "site" else "")
            self.assertEqual(entries["CELEBIX_SEARCH_WORKER_ENABLED"]["value"], "true" if role == "site" else "false")
            for entry in entries.values():
                self.assertFalse(entry["is_buildtime"])
                self.assertNotIn("is_build_time", entry)
                self.assertFalse(entry["is_preview"])
                self.assertTrue(entry["is_runtime"])

    def test_repeated_environment_setup_performs_no_update_when_values_match(self):
        setup = implementation()
        changes = []

        def request(method, route, body=None):
            if method == "GET":
                role = next(role for role, app_id in setup.APPLICATIONS.items() if app_id in route)
                return setup.environment_entries("read", "write", role == "site")
            changes.append(route)

        setup.wire_applications(request, "read", "write", worker="site")
        self.assertEqual(changes, [])

    def test_existing_index_and_saved_keys_are_reused_without_wiping_documents(self):
        setup = implementation()
        calls = []
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            credentials = setup.prepare_secrets(root)
            setup.write_private(root / "search.key", "read\n")
            setup.write_private(root / "write.key", "write\n")

            def request(method, route, body=None):
                calls.append((method, route, body))
                if route.startswith("/keys/"):
                    key_kind = "search" if credentials["uids"]["search"] in route else "write"
                    return setup.key_definition(key_kind, credentials["uids"][key_kind])
                if route == "/indexes/celebix_products_v1":
                    return {"uid": setup.INDEX, "primaryKey": "id"}
                if route.endswith("/settings"):
                    return {"taskUid": 5}
                if route == "/tasks/5":
                    return {"status": "succeeded"}
                raise AssertionError("Unexpected request: " + route)

            keys = setup.bootstrap_index_and_keys(request, root, credentials)
            self.assertEqual(keys, {"search": "read", "write": "write"})
            self.assertFalse(any(method == "DELETE" for method, _, _ in calls))
            self.assertFalse(any(method == "POST" for method, _, _ in calls))
            self.assertEqual(setup.key_definition("search", "uid")["actions"], ["search"])
            self.assertEqual(setup.key_definition("write", "uid")["indexes"], [setup.INDEX])
            self.assertNotIn("*", setup.key_definition("write", "uid")["actions"])

    def test_existing_broad_key_is_rejected_before_app_configuration(self):
        setup = implementation()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            credentials = setup.prepare_secrets(root)
            setup.write_private(root / "search.key", "read\n")

            def request(method, route, body=None):
                self.assertTrue(route.startswith("/keys/"))
                return {"uid": credentials["uids"]["search"], "actions": ["*"], "indexes": ["*"]}

            with self.assertRaisesRegex(setup.SetupError, "key_scope_mismatch"):
                setup.bootstrap_index_and_keys(request, root, credentials)

    def test_fresh_setup_creates_scoped_keys_and_waits_for_index_and_settings(self):
        setup = implementation()
        calls = []
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            credentials = setup.prepare_secrets(root)

            def request(method, route, body=None):
                calls.append((method, route, body))
                if method == "GET" and (route.startswith("/keys/") or route.startswith("/indexes/")):
                    raise setup.ApiError(404)
                if method == "POST" and route == "/keys":
                    return {**body, "key": "saved-" + body["uid"]}
                if method == "POST" and route == "/indexes":
                    return {"taskUid": 1}
                if method == "PATCH" and route.endswith("/settings"):
                    return {"taskUid": 2}
                if route in ("/tasks/1", "/tasks/2"):
                    return {"status": "succeeded"}
                raise AssertionError("Unexpected request: " + route)

            setup.bootstrap_index_and_keys(request, root, credentials)
            self.assertEqual([body for method, route, body in calls if method == "POST" and route == "/indexes"], [{"uid": setup.INDEX, "primaryKey": "id"}])
            self.assertEqual([route for method, route, _ in calls if route.startswith("/tasks/")], ["/tasks/1", "/tasks/2"])
            self.assertEqual((root / "search.key").stat().st_mode & 0o777, 0o600)
            self.assertEqual((root / "write.key").stat().st_mode & 0o777, 0o600)

    def test_failed_environment_readback_stops_before_touching_the_next_app(self):
        setup = implementation()
        calls = []

        def request(method, route, body=None):
            calls.append((method, route))
            return [] if method == "GET" else None

        with self.assertRaisesRegex(setup.SetupError, "coolify_environment_verification_failed"):
            setup.wire_applications(request, "read", "write")
        self.assertTrue(all(setup.APPLICATIONS["site"] in route for _, route in calls))
        self.assertFalse(any("/start" in route or "/restart" in route or "/deploy" in route for _, route in calls))

    def test_wrong_shared_app_or_host_fails_before_service_mutation(self):
        setup = implementation()
        with self.assertRaisesRegex(setup.SetupError, "wrong_target_host"):
            setup.validate_host("someone-else")
        with self.assertRaisesRegex(setup.SetupError, "wrong_shared_application"):
            setup.validate_application({"uuid": setup.APPLICATIONS["site"], "build_command": "npm run build --workspace @celebix/owner"}, setup.APPLICATIONS["site"])

    def test_local_cli_reads_typed_metadata_through_a_captured_json_pipe(self):
        setup = implementation()
        backend = getattr(setup, "CoolifyLocalCli", None)
        self.assertIsNotNone(backend, "The guarded local CLI transport is missing")
        captured = []

        def execute(*arguments, **options):
            captured.append((arguments, json.loads(options["input_text"])))
            return json.dumps({"ok": True, "data": [{"key": "CELEBIX_SEARCH_WORKER_ENABLED", "value": "false", "is_runtime": True, "is_buildtime": False, "is_preview": False}]})

        rows = backend(execute=execute)("GET", "/applications/" + setup.APPLICATIONS["site"] + "/envs")
        self.assertIs(rows[0]["is_runtime"], True)
        self.assertIs(rows[0]["is_buildtime"], False)
        self.assertEqual(captured[0][0][:4], ("exec", "-i", "coolify", "php"))
        self.assertFalse(captured[0][1]["writeAllowed"])

    def test_local_cli_refuses_unknown_apps_keys_and_writes_without_apply(self):
        setup = implementation()
        backend = getattr(setup, "CoolifyLocalCli", None)
        self.assertIsNotNone(backend, "The guarded local CLI transport is missing")

        def execute(*arguments, **options):
            self.fail("A refused request reached the Docker transport")

        route = "/applications/" + setup.APPLICATIONS["site"] + "/envs/bulk"
        with self.assertRaisesRegex(setup.SetupError, "local_cli_write_not_allowed"):
            backend(execute=execute)("PATCH", route, {"data": setup.environment_entries("r" * 32, "w" * 32, True)})
        with self.assertRaisesRegex(setup.SetupError, "local_cli_request_refused"):
            backend(writable=True, execute=execute)("GET", "/applications/not-approved/envs")
        entry = {**setup.environment_entries("r" * 32, "w" * 32, True)[0], "key": "UNRELATED"}
        with self.assertRaisesRegex(setup.SetupError, "local_cli_request_refused"):
            backend(writable=True, execute=execute)("PATCH", route, {"data": [entry]})
        with self.assertRaisesRegex(setup.SetupError, "local_cli_request_refused"):
            backend(writable=True, execute=execute)("POST", "/applications/" + setup.APPLICATIONS["site"] + "/restart")

    def test_local_cli_writes_only_guarded_runtime_fields_via_stdin(self):
        setup = implementation()
        backend = getattr(setup, "CoolifyLocalCli", None)
        self.assertIsNotNone(backend, "The guarded local CLI transport is missing")
        captured = []

        def execute(*arguments, **options):
            captured.append((arguments, json.loads(options["input_text"])))
            return json.dumps({"ok": True, "data": {"updated": 5, "otherEnvironmentUnchanged": True}})

        body = {"data": setup.environment_entries("r" * 32, "w" * 32, True)}
        response = backend(writable=True, execute=execute)("PATCH", "/applications/" + setup.APPLICATIONS["site"] + "/envs/bulk", body)
        self.assertTrue(response["otherEnvironmentUnchanged"])
        self.assertTrue(captured[0][1]["writeAllowed"])
        self.assertEqual(captured[0][1]["body"], body)
        self.assertFalse(any("r" * 32 in argument or "w" * 32 in argument for argument in captured[0][0]))

    def test_before_snapshot_is_private_and_contains_only_owned_runtime_fields(self):
        setup = implementation()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()

            def request(method, route, body=None):
                return setup.environment_entries("r" * 32, "w" * 32, True) + [
                    {"key": "UNRELATED", "value": "exclude-this"},
                    {"key": "CELEBIX_SEARCH_API_KEY", "value": "exclude-preview", "is_preview": True},
                ]

            setup.snapshot_environments(request, root)
            snapshots = list((root / "history").glob("*/coolify-env-before.json"))
            self.assertEqual(len(snapshots), 1)
            self.assertEqual(snapshots[0].stat().st_mode & 0o777, 0o600)
            text = snapshots[0].read_text()
            self.assertNotIn("exclude-this", text)
            self.assertNotIn("exclude-preview", text)
            self.assertEqual(set(json.loads(text)), {"site", "net"})

    def test_api_backend_rejects_hidden_values_before_creating_a_snapshot(self):
        setup = implementation()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            with self.assertRaisesRegex(setup.SetupError, "coolify_sensitive_read_required"):
                setup.snapshot_environments(lambda *_: [{"key": "SOME_EXISTING_KEY", "is_preview": False}], root, api_backend=True)
            self.assertFalse((root / "history").exists())


if __name__ == "__main__":
    unittest.main()
