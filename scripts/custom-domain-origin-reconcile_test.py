import importlib.util
import pathlib
import os
import tempfile
import unittest
from unittest.mock import patch


SCRIPT = pathlib.Path(__file__).with_name("custom-domain-origin-reconcile.py")
spec = importlib.util.spec_from_file_location("domain_reconcile", SCRIPT)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class PublicationTests(unittest.TestCase):
    def test_bad_snapshot_cannot_replace_live_routes(self):
        with patch.object(module, "publication_lock", side_effect=lambda: os.open(os.devnull, os.O_RDONLY)), \
                patch.object(module, "dependencies_ready"), \
                patch.object(module, "read_rows", return_value=[{"hostname": "invalid"}]), \
                patch.object(module, "load_generator", return_value=lambda rows: (_ for _ in ()).throw(ValueError("bad"))), \
                patch.object(module, "atomic_publish") as publish:
            with self.assertRaises(ValueError):
                module.main(["--apply"])
            publish.assert_not_called()

    def test_dependency_failure_preserves_routes_and_does_not_query_database(self):
        with patch.object(module, "publication_lock", side_effect=lambda: os.open(os.devnull, os.O_RDONLY)), \
                patch.object(module, "dependencies_ready", side_effect=ValueError("unavailable")), \
                patch.object(module, "read_rows") as read, \
                patch.object(module, "atomic_publish") as publish:
            with self.assertRaises(ValueError):
                module.main(["--apply"])
            read.assert_not_called()
            publish.assert_not_called()

    def test_atomic_write_avoids_unchanged_churn_and_does_not_touch_other_files(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            destination = root / "managed.yaml"
            other = root / "existing.yaml"
            other.write_text("preserve")
            self.assertTrue(module.atomic_publish(destination, b'{"http":{}}\n'))
            before = destination.stat()
            self.assertFalse(module.atomic_publish(destination, b'{"http":{}}\n'))
            self.assertEqual(before.st_ino, destination.stat().st_ino)
            self.assertEqual(before.st_mtime_ns, destination.stat().st_mtime_ns)
            self.assertEqual(other.read_text(), "preserve")

    def test_failed_replace_keeps_previous_file_and_cleans_staging_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            destination = root / "managed.yaml"
            destination.write_bytes(b"old")
            with patch.object(module.os, "replace", side_effect=OSError("unavailable")):
                with self.assertRaises(OSError):
                    module.atomic_publish(destination, b"new")
            self.assertEqual(destination.read_bytes(), b"old")
            self.assertEqual(list(root.iterdir()), [destination])

    def test_symlink_destination_is_rejected_without_changing_target(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            target = root / "other.yaml"
            target.write_bytes(b"preserve")
            destination = root / "managed.yaml"
            destination.symlink_to(target)
            with self.assertRaises(ValueError):
                module.atomic_publish(destination, b"new")
            self.assertEqual(target.read_bytes(), b"preserve")


if __name__ == "__main__":
    unittest.main()
