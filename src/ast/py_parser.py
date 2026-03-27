#!/usr/bin/env python3
"""
Python AST Parser for Optinum — bidirectional traversal using ast (+ libcst if available).

Outputs DiffBlastRadius JSON matching the TypeScript pipeline shape:
  { changed, dependents, dependencies, highFanOut }
"""
import ast
import json
import os
import sys
from pathlib import Path

try:
    import libcst as cst  # noqa: F401
    _cst = cst  # referenced to suppress unused-import diagnostic
    HAS_LIBCST = True
except ImportError:
    HAS_LIBCST = False

_EXCLUDED_DIRS = {"__pycache__", ".venv", "venv", "node_modules", ".git", "dist", ".mypy_cache"}


def find_py_files(root: str) -> list[str]:
    """Walk root, returning .py source files (excludes test files and __pycache__)."""
    results = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in _EXCLUDED_DIRS]
        for f in filenames:
            if f.endswith(".py") and not f.startswith("test_") and not f.endswith("_test.py"):
                results.append(os.path.join(dirpath, f))
    return results


def _parse(filepath: str) -> tuple[str, ast.Module | None]:
    """Read and parse a Python file. Returns (source, tree) or (source, None) on error."""
    try:
        with open(filepath) as fh:
            source = fh.read()
        return source, ast.parse(source, filename=filepath)
    except (SyntaxError, OSError):
        return "", None


def extract_functions_from_file(filepath: str) -> list[dict]:
    """Return all function/method definitions in a Python file as FunctionNode dicts."""
    _, tree = _parse(filepath)
    if tree is None:
        return []
    return [
        {
            "filePath": os.path.abspath(filepath),
            "functionName": node.name,
            "startLine": node.lineno,
            "endLine": node.end_lineno or node.lineno,
        }
        for node in ast.walk(tree)
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
    ]


def extract_imports(filepath: str) -> dict:
    """
    Extract import declarations from a file.

    Returns:
        {
            "imports": [{"from": str, "name": str, "asname": str|None}, ...],
            "wildcards": [module_name, ...]  # modules imported via 'from x import *'
        }
    """
    _, tree = _parse(filepath)
    if tree is None:
        return {"imports": [], "wildcards": []}

    imports: list[dict] = []
    wildcards: list[str] = []

    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom):
            module = node.module or ""
            for alias in node.names:
                if alias.name == "*":
                    wildcards.append(module)
                else:
                    imports.append({
                        "from": module,
                        "name": alias.name,
                        "asname": alias.asname,
                    })
        elif isinstance(node, ast.Import):
            for alias in node.names:
                imports.append({"module": alias.name, "asname": alias.asname})

    return {"imports": imports, "wildcards": wildcards}


def _call_name(call_node: ast.Call) -> str:
    """Extract the bare function name from a Call node (Name or Attribute)."""
    if isinstance(call_node.func, ast.Name):
        return call_node.func.id
    if isinstance(call_node.func, ast.Attribute):
        return call_node.func.attr
    return ""


def find_callers(project_root: str, changed_file: str, changed_functions: list[str]) -> list[dict]:
    """
    Upward traversal: find all FunctionNodes in project_root that call any of changed_functions.

    Files that use 'from <changed_module> import *' are excluded with a stderr warning.
    """
    if not changed_functions:
        return []

    changed_module = Path(changed_file).stem
    changed_abs = os.path.abspath(changed_file)
    fn_set = set(changed_functions)
    callers: list[dict] = []
    seen: set[str] = set()

    for pyfile in find_py_files(project_root):
        if os.path.abspath(pyfile) == changed_abs:
            continue

        _, tree = _parse(pyfile)
        if tree is None:
            continue

        import_info = extract_imports(pyfile)

        # Wildcard import — cannot safely determine what names are in scope
        if changed_module in import_info.get("wildcards", []):
            print(
                f"[py-parser] wildcard-import-warning: {pyfile} uses "
                f"'from {changed_module} import *' — excluded from traversal",
                file=sys.stderr,
            )
            continue

        # Check whether this file imports relevant names from the changed module
        imports_target = any(
            (
                imp.get("from", "") == changed_module
                or imp.get("from", "").endswith("." + changed_module)
            )
            and imp.get("name", "") in fn_set
            for imp in import_info.get("imports", [])
        )

        # Also scan for any bare call to a changed function name (handles alias imports)
        has_any_call = any(
            _call_name(node) in fn_set
            for node in ast.walk(tree)
            if isinstance(node, ast.Call)
        )

        if not (imports_target or has_any_call):
            continue

        # Find the containing function for each matching call
        for func_node in ast.walk(tree):
            if not isinstance(func_node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                continue

            func_has_call = any(
                _call_name(call_node) in fn_set
                for call_node in ast.walk(func_node)
                if isinstance(call_node, ast.Call)
            )
            if not func_has_call:
                continue

            key = f"{pyfile}:{func_node.name}"
            if key not in seen:
                seen.add(key)
                callers.append({
                    "filePath": os.path.abspath(pyfile),
                    "functionName": func_node.name,
                    "startLine": func_node.lineno,
                    "endLine": func_node.end_lineno or func_node.lineno,
                })

    return callers


def find_dependencies(changed_file: str) -> list[dict]:
    """
    Downward traversal: find FunctionNodes that changed_file calls from imported modules.

    Only tracks names explicitly imported via 'from module import name'.
    """
    _, tree = _parse(changed_file)
    if tree is None:
        return []

    # Build name → module map from explicit imports
    import_map: dict[str, str] = {}
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom) and node.module:
            for alias in node.names:
                if alias.name != "*":
                    local_name = alias.asname or alias.name
                    import_map[local_name] = node.module

    deps: list[dict] = []
    seen: set[str] = set()

    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        name = _call_name(node)
        if not name or name not in import_map:
            continue
        module = import_map[name]
        key = f"{module}:{name}"
        if key in seen:
            continue
        seen.add(key)
        deps.append({
            "filePath": module.replace(".", "/") + ".py",
            "functionName": name,
            "startLine": getattr(node, "lineno", 0),
            "endLine": getattr(node, "end_lineno", 0) or getattr(node, "lineno", 0),
        })

    return deps


def parse_blast_radius(project_root: str, changed_files: list[str]) -> dict:
    """
    Compute DiffBlastRadius for a list of changed Python files.

    Returns the canonical shape:
        { changed, dependents, dependencies, highFanOut }
    """
    changed: list[dict] = []
    all_dependents: list[dict] = []
    all_dependencies: list[dict] = []
    seen_dep_keys: set[str] = set()

    for changed_file in changed_files:
        abs_path = os.path.abspath(changed_file)
        full_path = abs_path if os.path.exists(abs_path) else os.path.join(project_root, changed_file)

        if not os.path.exists(full_path):
            print(f"[py-parser] File not found: {full_path}", file=sys.stderr)
            continue

        fns = extract_functions_from_file(full_path)
        changed.extend(fns)

        changed_fn_names = [f["functionName"] for f in fns]
        all_dependents.extend(find_callers(project_root, full_path, changed_fn_names))

        for dep in find_dependencies(full_path):
            key = f"{dep['filePath']}:{dep['functionName']}"
            if key not in seen_dep_keys:
                seen_dep_keys.add(key)
                all_dependencies.append(dep)

    high_fan_out = len(all_dependents) > 20
    if high_fan_out:
        print(f"[py-parser] High fan-out: {len(all_dependents)} dependents", file=sys.stderr)

    return {
        "changed": changed,
        "dependents": all_dependents,
        "dependencies": all_dependencies,
        "highFanOut": high_fan_out,
    }


if __name__ == "__main__":
    import argparse

    arg_parser = argparse.ArgumentParser(description="Optinum Python ASTParser")
    arg_parser.add_argument("--root", required=True, help="Project root directory")
    arg_parser.add_argument("--files", nargs="+", required=True, help="Changed file paths")
    args = arg_parser.parse_args()

    result = parse_blast_radius(args.root, args.files)
    print(json.dumps(result, indent=2))
