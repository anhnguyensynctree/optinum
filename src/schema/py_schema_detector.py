#!/usr/bin/env python3
"""
Python SchemaDetector for Optinum.

Detects Pydantic BaseModel subclasses in Python files and normalizes to EndpointContract JSON.
Falls back to OpenAPI JSON if no Pydantic model found.
"""
import ast
import json
import os
import sys
from typing import Optional  # noqa: F401


def is_optional_type(annotation_node) -> bool:
    """Check if an AST type annotation represents Optional[T]."""
    if isinstance(annotation_node, ast.Subscript):
        # Optional[T] → Subscript(value=Name("Optional"), ...)
        # Union[T, None] → Subscript(value=Attribute(attr="Union") or Name("Union"), ...)
        if isinstance(annotation_node.value, ast.Name):
            if annotation_node.value.id == "Optional":
                return True
    if isinstance(annotation_node, ast.BinOp):
        # Python 3.10+ union: T | None
        if isinstance(annotation_node.right, ast.Constant) and annotation_node.right.value is None:
            return True
        if isinstance(annotation_node.right, ast.Name) and annotation_node.right.id == "None":
            return True
    return False


def annotation_to_type_string(annotation_node) -> str:
    """Convert AST type annotation to a human-readable string."""
    if annotation_node is None:
        return "unknown"

    if isinstance(annotation_node, ast.Name):
        return annotation_node.id.lower()

    if isinstance(annotation_node, ast.Attribute):
        return annotation_node.attr.lower()

    if isinstance(annotation_node, ast.Subscript):
        value_name = ""
        if isinstance(annotation_node.value, ast.Name):
            value_name = annotation_node.value.id
        elif isinstance(annotation_node.value, ast.Attribute):
            value_name = annotation_node.value.attr

        if value_name == "Optional":
            # Return the inner type
            if isinstance(annotation_node.slice, ast.Name):
                return annotation_node.slice.id.lower()
            return "unknown"

        if value_name == "List":
            return "array"

        if value_name == "Dict":
            return "object"

        return value_name.lower()

    if isinstance(annotation_node, ast.Constant):
        return str(annotation_node.value).lower()

    return "unknown"


def extract_pydantic_models(filepath: str) -> list[dict]:
    """
    Extract Pydantic BaseModel subclasses from a Python file.
    Returns list of model dicts with {name, fields: [{name, type, required}]}.
    """
    try:
        with open(filepath) as f:
            source = f.read()
        tree = ast.parse(source, filename=filepath)
    except (SyntaxError, OSError) as e:
        print(f"[py-schema-detector] Parse error in {filepath}: {e}", file=sys.stderr)
        return []

    models = []

    for node in ast.walk(tree):
        if not isinstance(node, ast.ClassDef):
            continue

        # Check if it inherits from BaseModel (or any common Pydantic patterns)
        is_pydantic = any(
            (isinstance(base, ast.Name) and base.id in ("BaseModel", "BaseSettings")) or
            (isinstance(base, ast.Attribute) and base.attr in ("BaseModel", "BaseSettings"))
            for base in node.bases
        )

        if not is_pydantic:
            continue

        fields = []
        for item in node.body:
            if not isinstance(item, ast.AnnAssign):
                continue

            # Get field name
            if isinstance(item.target, ast.Name):
                field_name = item.target.id
            else:
                continue

            # Skip private and class vars
            if field_name.startswith("_"):
                continue
            if isinstance(item.annotation, ast.Subscript):
                if isinstance(item.annotation.value, ast.Name) and item.annotation.value.id == "ClassVar":
                    continue

            field_type = annotation_to_type_string(item.annotation)
            required = not is_optional_type(item.annotation)

            # Check if there's a default value (makes it not required)
            if item.value is not None:
                # Has default → not required
                if isinstance(item.value, ast.Constant) and item.value.value is None:
                    required = False  # default None
                else:
                    required = False  # has any default

            fields.append({
                "name": field_name,
                "type": field_type,
                "required": required,
            })

        if fields:
            models.append({
                "name": node.name,
                "fields": fields,
            })

    return models


def load_openapi_fallback(project_root: str) -> list[dict]:
    """Try to load OpenAPI JSON from common locations."""
    candidates = [
        "openapi.json",
        "openapi.yaml",
        "docs/openapi.json",
        "static/openapi.json",
    ]

    for candidate in candidates:
        full_path = os.path.join(project_root, candidate)
        if not os.path.exists(full_path):
            continue

        try:
            if full_path.endswith(".json"):
                with open(full_path) as f:
                    spec = json.load(f)
            else:
                # YAML fallback
                try:
                    import yaml
                    with open(full_path) as f:
                        spec = yaml.safe_load(f)
                except ImportError:
                    continue

            # Extract paths from OpenAPI spec
            contracts = []
            for path_str, path_item in spec.get("paths", {}).items():
                for method, operation in path_item.items():
                    if method.upper() not in ("GET", "POST", "PUT", "PATCH", "DELETE"):
                        continue

                    fields = []
                    body = operation.get("requestBody", {})
                    schema = body.get("content", {}).get("application/json", {}).get("schema", {})

                    for prop_name, prop_schema in schema.get("properties", {}).items():
                        required = prop_name in schema.get("required", [])
                        fields.append({
                            "name": prop_name,
                            "type": prop_schema.get("type", "unknown"),
                            "required": required,
                        })

                    contracts.append({
                        "endpoint": path_str,
                        "method": method.upper(),
                        "fields": fields,
                        "source": "openapi",
                    })

            return contracts

        except (json.JSONDecodeError, KeyError):
            continue

    return []


def detect_schemas(file_paths: list[str], project_root: str) -> list[dict]:
    """
    Detect schemas from Python files, returning EndpointContract[] JSON.

    Priority: Pydantic BaseModel > OpenAPI
    """
    contracts = []

    for filepath in file_paths:
        abs_path = os.path.abspath(filepath) if not os.path.isabs(filepath) else filepath
        if not os.path.isabs(filepath):
            abs_path = os.path.join(project_root, filepath)

        if not os.path.exists(abs_path):
            print(f"[py-schema-detector] schema-not-found: {abs_path}", file=sys.stderr)
            contracts.append({
                "endpoint": "/unknown",
                "method": "POST",
                "fields": [],
                "source": "unknown",
            })
            continue

        models = extract_pydantic_models(abs_path)

        if models:
            # Infer endpoint from FastAPI patterns if possible
            for model in models:
                endpoint = "/" + model["name"].lower().replace("request", "").replace("body", "").rstrip("/")
                contracts.append({
                    "endpoint": endpoint or "/unknown",
                    "method": "POST",
                    "fields": model["fields"],
                    "source": "pydantic",
                })
        else:
            print(f"[py-schema-detector] No Pydantic models in {abs_path}, trying OpenAPI fallback", file=sys.stderr)

    # If nothing found from files, try OpenAPI
    if not contracts:
        openapi_contracts = load_openapi_fallback(project_root)
        if openapi_contracts:
            contracts.extend(openapi_contracts)
        else:
            print(f"[py-schema-detector] schema-not-found: no Pydantic models and no OpenAPI spec", file=sys.stderr)
            contracts.append({
                "endpoint": "/unknown",
                "method": "POST",
                "fields": [],
                "source": "unknown",
            })

    return contracts


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Optinum Python SchemaDetector")
    parser.add_argument("--root", required=True, help="Project root")
    parser.add_argument("--files", nargs="+", required=True, help="Files to scan")
    args = parser.parse_args()

    result = detect_schemas(args.files, args.root)
    print(json.dumps(result, indent=2))
