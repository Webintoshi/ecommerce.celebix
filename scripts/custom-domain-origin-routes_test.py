import copy
import importlib.util
import json
import pathlib
import subprocess
import sys
import unittest


SCRIPT = pathlib.Path(__file__).with_name("custom-domain-origin-routes.py")


def row(identifier="11111111-1111-4111-8111-111111111111", hostname="ezmeo.com",
        role="storefront", platform_hostname="ezmeo.saas-staging.celebix.site"):
    return {"id": identifier, "hostname": hostname, "role": role,
            "platform_hostname": platform_hostname}


class CustomDomainOriginRoutesTests(unittest.TestCase):
    def setUp(self):
        if not SCRIPT.is_file():
            self.fail("The custom domain route generator has not been implemented")
        spec = importlib.util.spec_from_file_location("custom_domain_origin_routes", SCRIPT)
        self.module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.module)

    def generate(self, rows):
        return self.module.create_custom_domain_routes(rows)

    def test_ezmeo_roles_select_existing_services_in_both_environments(self):
        cases = [
            ("ezmeo.com", "storefront", "ezmeo.saas-staging.celebix.site",
             "https-0-vtc2aah63jbqnmtxmvykn6jl@docker",
             ["gzip@docker", "celebix-storefront-authority-vtc2aah63jbqnmtxmvykn6jl@docker"]),
            ("admin.ezmeo.com", "admin", "ezmeo.admin.saas-staging.celebix.site",
             "https-0-yk1h6d97z7ex0h74ok3zrj5c@docker", ["gzip@docker"]),
            ("ezmeo.com", "storefront", "ezmeo.saas-staging.celebix.net",
             "https-0-h55zoba9jh6ij8g6irpqzd9i@docker",
             ["gzip@docker", "celebix-storefront-authority-h55zoba9jh6ij8g6irpqzd9i@docker"]),
            ("admin.ezmeo.com", "admin", "ezmeo.admin.saas-staging.celebix.net",
             "https-0-e4xe74cmii7jucbkyor0o412@docker", ["gzip@docker"]),
        ]
        for hostname, role, platform, service, base in cases:
            with self.subTest(hostname=hostname, platform=platform):
                config = self.generate([row(hostname=hostname, role=role, platform_hostname=platform)])
                self.assertEqual(set(config), {"http"})
                self.assertEqual(set(config["http"]), {"routers", "middlewares"})
                routers = config["http"]["routers"]
                self.assertEqual(len(routers), 3)
                plain = [route for route in routers.values() if route["priority"] == 15]
                self.assertEqual(len(plain), 2)
                http = next(route for route in plain if route["entryPoints"] == ["http"])
                https = next(route for route in plain if route["entryPoints"] == ["https"])
                self.assertEqual(http["rule"], "Host(`" + hostname + "`)")
                self.assertEqual(https["rule"], http["rule"])
                self.assertEqual(http["service"], service)
                self.assertEqual(https["service"], service)
                self.assertTrue(all(route["service"] == service for route in routers.values()))
                self.assertEqual(https["middlewares"], base)
                self.assertEqual(https["tls"], {})
                self.assertNotIn("tls", http)
                self.assertEqual(http["ruleSyntax"], "v3")
                self.assertEqual(https["ruleSyntax"], "v3")
                self.assertEqual(len(http["middlewares"]), 1)
                redirect = http["middlewares"][0]
                self.assertTrue(redirect.endswith("@file"))
                self.assertEqual(config["http"]["middlewares"], {
                    redirect[:-5]: {"redirectScheme": {"scheme": "https", "permanent": True}}
                })
                for name in routers:
                    self.assertIn("11111111111141118111111111111111", name)
                    self.assertIn(role, name)
                    self.assertNotIn(hostname, name)

    def test_otp_paths_require_post_and_preserve_authority_before_ingress_auth(self):
        cases = [
            (row(), "(Host(`ezmeo.com`)) && Method(`POST`) && (Path(`/api/account/auth/start`))",
             ["gzip@docker", "celebix-storefront-authority-vtc2aah63jbqnmtxmvykn6jl@docker",
              "celebix-admin-login-ingress-auth@file"]),
            (row(hostname="admin.ezmeo.com", role="admin",
                 platform_hostname="ezmeo.admin.saas-staging.celebix.net"),
             "(Host(`admin.ezmeo.com`)) && Method(`POST`) && (Path(`/api/merchant-login/start`) || "
             "Path(`/api/merchant-login/resend`) || Path(`/api/merchant-login/bind/start`) || "
             "Path(`/api/merchant-login/bind/resend`))",
             ["gzip@docker", "celebix-admin-login-ingress-auth@file"]),
        ]
        for source, rule, middlewares in cases:
            with self.subTest(role=source["role"]):
                routes = self.generate([source])["http"]["routers"].values()
                otp = next(route for route in routes if route["priority"] == 10015)
                self.assertEqual(otp["rule"], rule)
                self.assertEqual(otp["entryPoints"], ["https"])
                self.assertEqual(otp["middlewares"], middlewares)
                self.assertEqual(otp["tls"], {})

    def test_only_exact_registered_hosts_are_routed_and_no_authority_is_manufactured(self):
        rows = [row(), row("22222222-2222-4222-8222-222222222222", "admin.ezmeo.com", "admin",
                           "ezmeo.admin.saas-staging.celebix.site")]
        config = self.generate(rows)
        for route in config["http"]["routers"].values():
            self.assertNotIn("HostRegexp", route["rule"])
            self.assertNotIn("unknown.example", route["rule"])
            self.assertNotIn("saas-staging", route["rule"])
            self.assertNotIn("certResolver", route.get("tls", {}))
            self.assertNotIn("headers", route)
            self.assertNotIn("passHostHeader", route)
            self.assertTrue(route["rule"].startswith(("Host(`ezmeo.com`)", "Host(`admin.ezmeo.com`)",
                                                      "(Host(`ezmeo.com`))", "(Host(`admin.ezmeo.com`))")))
        self.assertNotIn("services", config["http"])

    def test_reordering_is_deterministic_without_mutating_input_and_names_survive_hostname_change(self):
        rows = [row("22222222-2222-4222-8222-222222222222", "admin.ezmeo.com", "admin",
                    "ezmeo.admin.saas-staging.celebix.site"), row()]
        before = copy.deepcopy(rows)
        first = self.generate(rows)
        self.assertEqual(json.dumps(first), json.dumps(self.generate(list(reversed(rows)))))
        self.assertEqual(rows, before)
        self.assertEqual(set(self.generate([row()])["http"]["routers"]),
                         set(self.generate([row(hostname="shop.example")])["http"]["routers"]))
        first["http"]["routers"].clear()
        self.assertEqual(len(self.generate(rows)["http"]["routers"]), 6)

    def test_duplicate_ids_or_hostnames_fail_closed(self):
        for rows in ([row(), row(hostname="other.example")],
                     [row(), row(identifier="22222222-2222-4222-8222-222222222222")]):
            with self.subTest(rows=rows):
                with self.assertRaises(ValueError):
                    self.generate(rows)

    def test_malformed_records_types_and_ids_fail_closed(self):
        bad_rows = [None, {}, "[]", (), [None], [1], [dict(row(), service="attacker@docker")],
                    [{key: value for key, value in row().items() if key != "id"}]]
        for key, value in [("id", None), ("id", "not-a-uuid"),
                           ("id", "11111111111141118111111111111111"),
                           ("hostname", None), ("role", "owner"), ("role", 1),
                           ("platform_hostname", None)]:
            source = row()
            source[key] = value
            bad_rows.append([source])
        for rows in bad_rows:
            with self.subTest(rows=rows):
                with self.assertRaises(ValueError):
                    self.generate(rows)

    def test_host_injection_noncanonical_ip_and_reserved_domains_fail_closed(self):
        bad = ["", "Ezmeo.com", "ezmeo.com.", " ezmeo.com", "ezmeo.com ", "ezmeo.com:443",
               "https://ezmeo.com", "ezmeo.com/path", "ezmeo.com\n", "ezmeo.com\x00",
               "ézmeo.com", "ezmeo.com`) || Host(`evil.example", "*.ezmeo.com", "localhost",
               "127.0.0.1", "-shop.example", "shop-.example", "a..example", "a_b.example",
               "a" * 64 + ".example", "celebix.net", "celebix.site", "x.celebix.net",
               "x.y.celebix.site", ".".join(["a" * 63] * 4)]
        for hostname in bad:
            with self.subTest(hostname=hostname):
                with self.assertRaises(ValueError):
                    self.generate([row(hostname=hostname)])
        boundary = ".".join(["a" * 63] * 3 + ["b" * 61])
        self.assertEqual(len(boundary), 253)
        self.assertEqual(len(self.generate([row(hostname=boundary)])["http"]["routers"]), 3)
        self.assertEqual(len(self.generate([row(hostname="notcelebix.net")])["http"]["routers"]), 3)

    def test_platform_mapping_rejects_extra_labels_reserved_tenants_role_mismatch_and_unknown_env(self):
        bad = ["ezmeo.celebix.site", "ezmeo.saas-staging.celebix.com",
               "ezmeo.saas-staging.celebix.site.evil.example", "ezmeo.admin.saas-staging.celebix.site",
               "nested.ezmeo.saas-staging.celebix.site", "Ezmeo.saas-staging.celebix.site",
               "-ezmeo.saas-staging.celebix.site", "ezmeo-.saas-staging.celebix.site",
               "a" * 64 + ".saas-staging.celebix.site"]
        reserved = ["admin", "api", "assets", "auth", "cdn", "ecommerce", "media", "owner",
                    "panel", "status", "support", "www"]
        for label in reserved:
            bad.append(label + ".saas-staging.celebix.net")
        for platform in bad:
            with self.subTest(platform=platform):
                with self.assertRaises(ValueError):
                    self.generate([row(platform_hostname=platform)])
        with self.assertRaises(ValueError):
            self.generate([row(role="admin")])

    def test_empty_snapshot_removes_only_owned_routes_and_row_limit_is_enforced(self):
        empty = self.generate([])
        self.assertEqual(empty["http"]["routers"], {})
        self.assertEqual(set(empty["http"]), {"routers", "middlewares"})
        rows = [row(f"{index:08x}-1111-4111-8111-111111111111", f"shop{index}.example")
                for index in range(1000)]
        self.assertEqual(len(self.generate(rows)["http"]["routers"]), 3000)
        with self.assertRaises(ValueError):
            self.generate(rows + [row("ffffffff-1111-4111-8111-111111111111", "overflow.example")])

    def test_cli_outputs_config_and_rejects_bad_bounded_input_without_echo(self):
        valid = subprocess.run([sys.executable, "-B", str(SCRIPT)], input=json.dumps([row()]).encode(),
                               capture_output=True, check=False)
        self.assertEqual(valid.returncode, 0)
        self.assertEqual(json.loads(valid.stdout), self.generate([row()]))
        self.assertEqual(valid.stderr, b"")
        duplicate_key = (b'[{"id":"secret-input","id":"11111111-1111-4111-8111-111111111111",'
                         b'"hostname":"ezmeo.com","role":"storefront",'
                         b'"platform_hostname":"ezmeo.saas-staging.celebix.site"}]')
        cases = [(b"secret-input-invalid-json", []), (b"\xff", []),
                 (b" " * (1024 * 1024 + 1) + b"[]", []), (b"[]", ["secret-argument"]),
                 (duplicate_key, [])]
        for payload, arguments in cases:
            with self.subTest(payload_length=len(payload), arguments=arguments):
                invalid = subprocess.run([sys.executable, "-B", str(SCRIPT), *arguments], input=payload,
                                         capture_output=True, check=False)
                self.assertEqual(invalid.returncode, 1)
                self.assertEqual(invalid.stdout, b"")
                self.assertEqual(json.loads(invalid.stderr),
                                 {"ok": False, "code": "custom_domain_origin_routes_invalid"})
                self.assertNotIn(b"secret", invalid.stderr)


if __name__ == "__main__":
    unittest.main()
