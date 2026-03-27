#!/usr/bin/env python3
"""Tests for the Python AST parser (py_parser.py)."""
import io
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(__file__))
from py_parser import (  # noqa: E402
    extract_functions_from_file,
    extract_imports,
    find_callers,
    find_dependencies,
    parse_blast_radius,
)


def _valid_shape(result: dict) -> bool:
    """Return True if result matches DiffBlastRadius shape."""
    return (
        isinstance(result, dict)
        and isinstance(result.get("changed"), list)
        and isinstance(result.get("dependents"), list)
        and isinstance(result.get("dependencies"), list)
        and "highFanOut" in result
    )


def _write(path: str, content: str) -> None:
    with open(path, "w") as fh:
        fh.write(content)


class TestReturnShape(unittest.TestCase):
    def test_valid_shape_for_simple_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            f = os.path.join(tmp, "svc.py")
            _write(f, "def get_user(uid): return uid\n")
            result = parse_blast_radius(tmp, [f])
        self.assertTrue(_valid_shape(result), f"Bad shape: {result}")

    def test_high_fan_out_field_present(self):
        with tempfile.TemporaryDirectory() as tmp:
            f = os.path.join(tmp, "svc.py")
            _write(f, "def fn(): pass\n")
            result = parse_blast_radius(tmp, [f])
        self.assertIn("highFanOut", result)

    def test_nonexistent_file_returns_empty(self):
        result = parse_blast_radius("/tmp", ["/tmp/no_such_file_xyz.py"])
        self.assertTrue(_valid_shape(result))
        self.assertEqual(result["changed"], [])
        self.assertEqual(result["dependents"], [])
        self.assertEqual(result["dependencies"], [])


class TestExtractFunctions(unittest.TestCase):
    def test_extracts_function_def(self):
        with tempfile.NamedTemporaryFile(suffix=".py", mode="w", delete=False) as fh:
            fh.write("def foo(x):\n    return x\n\ndef bar():\n    pass\n")
            path = fh.name
        try:
            fns = extract_functions_from_file(path)
            names = [f["functionName"] for f in fns]
            self.assertIn("foo", names)
            self.assertIn("bar", names)
        finally:
            os.unlink(path)

    def test_extracts_async_function(self):
        with tempfile.NamedTemporaryFile(suffix=".py", mode="w", delete=False) as fh:
            fh.write("async def fetch_data(): pass\n")
            path = fh.name
        try:
            fns = extract_functions_from_file(path)
            self.assertEqual(fns[0]["functionName"], "fetch_data")
        finally:
            os.unlink(path)

    def test_empty_file_returns_empty_list(self):
        with tempfile.NamedTemporaryFile(suffix=".py", mode="w", delete=False) as fh:
            fh.write("")
            path = fh.name
        try:
            self.assertEqual(extract_functions_from_file(path), [])
        finally:
            os.unlink(path)

    def test_comments_only_returns_empty_list(self):
        with tempfile.NamedTemporaryFile(suffix=".py", mode="w", delete=False) as fh:
            fh.write("# comment\n# another comment\n")
            path = fh.name
        try:
            self.assertEqual(extract_functions_from_file(path), [])
        finally:
            os.unlink(path)

    def test_function_node_has_required_keys(self):
        with tempfile.NamedTemporaryFile(suffix=".py", mode="w", delete=False) as fh:
            fh.write("def process(x): return x\n")
            path = fh.name
        try:
            fns = extract_functions_from_file(path)
            node = fns[0]
            for key in ("filePath", "functionName", "startLine", "endLine"):
                self.assertIn(key, node)
        finally:
            os.unlink(path)

    def test_syntax_error_returns_empty_list(self):
        with tempfile.NamedTemporaryFile(suffix=".py", mode="w", delete=False) as fh:
            fh.write("def broken(\n")
            path = fh.name
        try:
            self.assertEqual(extract_functions_from_file(path), [])
        finally:
            os.unlink(path)


class TestExtractImports(unittest.TestCase):
    def test_from_import(self):
        with tempfile.NamedTemporaryFile(suffix=".py", mode="w", delete=False) as fh:
            fh.write("from user_service import create_user\n")
            path = fh.name
        try:
            info = extract_imports(path)
            self.assertEqual(info["imports"][0]["from"], "user_service")
            self.assertEqual(info["imports"][0]["name"], "create_user")
        finally:
            os.unlink(path)

    def test_wildcard_detected(self):
        with tempfile.NamedTemporaryFile(suffix=".py", mode="w", delete=False) as fh:
            fh.write("from utils import *\n")
            path = fh.name
        try:
            info = extract_imports(path)
            self.assertIn("utils", info["wildcards"])
            self.assertEqual(info["imports"], [])
        finally:
            os.unlink(path)

    def test_plain_import(self):
        with tempfile.NamedTemporaryFile(suffix=".py", mode="w", delete=False) as fh:
            fh.write("import os\n")
            path = fh.name
        try:
            info = extract_imports(path)
            self.assertTrue(any(i.get("module") == "os" for i in info["imports"]))
        finally:
            os.unlink(path)


class TestFindCallers(unittest.TestCase):
    def test_finds_direct_caller(self):
        with tempfile.TemporaryDirectory() as tmp:
            svc = os.path.join(tmp, "user_service.py")
            route = os.path.join(tmp, "user_route.py")
            _write(svc, "def create_user(name): return name\n")
            _write(route, (
                "from user_service import create_user\n\n"
                "def register(data):\n"
                "    return create_user(data['name'])\n"
            ))
            callers = find_callers(tmp, svc, ["create_user"])
        paths = [c["filePath"] for c in callers]
        self.assertTrue(any("user_route" in p for p in paths), f"Not found in {paths}")

    def test_no_false_positives_from_unrelated_files(self):
        with tempfile.TemporaryDirectory() as tmp:
            svc = os.path.join(tmp, "svc.py")
            other = os.path.join(tmp, "other.py")
            _write(svc, "def special_fn(): pass\n")
            _write(other, "def unrelated(): return 1\n")
            callers = find_callers(tmp, svc, ["special_fn"])
        self.assertEqual(callers, [])

    def test_excludes_changed_file_itself(self):
        with tempfile.TemporaryDirectory() as tmp:
            svc = os.path.join(tmp, "svc.py")
            _write(svc, "def fn(): fn()\n")
            callers = find_callers(tmp, svc, ["fn"])
        paths = [c["filePath"] for c in callers]
        self.assertFalse(any("svc.py" in p for p in paths))

    def test_wildcard_import_excluded(self):
        with tempfile.TemporaryDirectory() as tmp:
            svc = os.path.join(tmp, "service.py")
            route = os.path.join(tmp, "route.py")
            _write(svc, "def create(): pass\n")
            _write(route, "from service import *\ndef handler():\n    return create()\n")

            stderr_capture = io.StringIO()
            old_stderr = sys.stderr
            sys.stderr = stderr_capture
            try:
                callers = find_callers(tmp, svc, ["create"])
            finally:
                sys.stderr = old_stderr

        paths = [c["filePath"] for c in callers]
        self.assertFalse(any("route" in p for p in paths), "Wildcard file must be excluded")
        self.assertIn("wildcard-import-warning", stderr_capture.getvalue())

    def test_empty_changed_functions_returns_empty(self):
        with tempfile.TemporaryDirectory() as tmp:
            svc = os.path.join(tmp, "svc.py")
            _write(svc, "def fn(): pass\n")
            callers = find_callers(tmp, svc, [])
        self.assertEqual(callers, [])


class TestFindDependencies(unittest.TestCase):
    def test_finds_imported_call(self):
        with tempfile.NamedTemporaryFile(suffix=".py", mode="w", delete=False) as fh:
            fh.write(
                "from db import fetch_record\n\ndef get_user(uid):\n    return fetch_record(uid)\n"
            )
            path = fh.name
        try:
            deps = find_dependencies(path)
            names = [d["functionName"] for d in deps]
            self.assertIn("fetch_record", names)
        finally:
            os.unlink(path)

    def test_no_deps_for_stdlib_only_file(self):
        with tempfile.NamedTemporaryFile(suffix=".py", mode="w", delete=False) as fh:
            fh.write("import os\ndef fn(): return os.getcwd()\n")
            path = fh.name
        try:
            # os.getcwd is an attribute call, not a tracked imported name
            deps = find_dependencies(path)
            names = [d["functionName"] for d in deps]
            self.assertNotIn("getcwd", names)
        finally:
            os.unlink(path)


class TestParseBlastRadius(unittest.TestCase):
    def test_changed_list_populated(self):
        with tempfile.TemporaryDirectory() as tmp:
            f = os.path.join(tmp, "svc.py")
            _write(f, "def alpha(): pass\ndef beta(): pass\n")
            result = parse_blast_radius(tmp, [f])
        names = [c["functionName"] for c in result["changed"]]
        self.assertIn("alpha", names)
        self.assertIn("beta", names)

    def test_multiple_changed_files(self):
        with tempfile.TemporaryDirectory() as tmp:
            f1 = os.path.join(tmp, "a.py")
            f2 = os.path.join(tmp, "b.py")
            _write(f1, "def fn_a(): pass\n")
            _write(f2, "def fn_b(): pass\n")
            result = parse_blast_radius(tmp, [f1, f2])
        names = [c["functionName"] for c in result["changed"]]
        self.assertIn("fn_a", names)
        self.assertIn("fn_b", names)

    def test_high_fan_out_false_by_default(self):
        with tempfile.TemporaryDirectory() as tmp:
            f = os.path.join(tmp, "svc.py")
            _write(f, "def small(): pass\n")
            result = parse_blast_radius(tmp, [f])
        self.assertFalse(result["highFanOut"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
