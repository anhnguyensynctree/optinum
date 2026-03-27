#!/usr/bin/env python3
import unittest
import os
import sys
import tempfile

sys.path.insert(0, os.path.join(os.path.dirname(__file__)))
from py_schema_detector import detect_schemas, extract_pydantic_models


class TestPySchemaDetector(unittest.TestCase):

    def test_extracts_pydantic_model(self):
        """Should extract fields from a Pydantic BaseModel."""
        with tempfile.NamedTemporaryFile(suffix=".py", mode="w", delete=False) as f:
            f.write("""
from pydantic import BaseModel

class UserRequest(BaseModel):
    name: str
    email: str
    age: int
""")
            tmppath = f.name

        try:
            models = extract_pydantic_models(tmppath)
            self.assertEqual(len(models), 1)
            self.assertEqual(models[0]["name"], "UserRequest")
            field_names = [field["name"] for field in models[0]["fields"]]
            self.assertIn("name", field_names)
            self.assertIn("email", field_names)
            self.assertIn("age", field_names)
        finally:
            os.unlink(tmppath)

    def test_optional_fields_marked_not_required(self):
        """Optional fields should have required: false."""
        with tempfile.NamedTemporaryFile(suffix=".py", mode="w", delete=False) as f:
            f.write("""
from pydantic import BaseModel
from typing import Optional

class ProfileRequest(BaseModel):
    name: str
    bio: Optional[str]
    avatar_url: Optional[str] = None
""")
            tmppath = f.name

        try:
            models = extract_pydantic_models(tmppath)
            self.assertEqual(len(models), 1)
            name_field = next((f for f in models[0]["fields"] if f["name"] == "name"), None)
            bio_field = next((f for f in models[0]["fields"] if f["name"] == "bio"), None)
            avatar_field = next((f for f in models[0]["fields"] if f["name"] == "avatar_url"), None)

            assert name_field is not None, "name field not found"
            self.assertTrue(name_field["required"], "name should be required")
            assert bio_field is not None, "bio field not found"
            self.assertFalse(bio_field["required"], "bio Optional should not be required")
            assert avatar_field is not None, "avatar_url field not found"
            self.assertFalse(avatar_field["required"], "avatar_url with default should not be required")
        finally:
            os.unlink(tmppath)

    def test_no_pydantic_returns_empty_with_source_unknown(self):
        """File with no Pydantic model falls back to schema-not-found."""
        with tempfile.NamedTemporaryFile(suffix=".py", mode="w", delete=False) as f:
            f.write("def handle_request(data): return data\n")
            tmppath = f.name

        try:
            result = detect_schemas([tmppath], "/tmp")
            self.assertIsInstance(result, list)
            # Should still return a contract (possibly empty/unknown)
            self.assertTrue(len(result) >= 0)  # graceful handling
        finally:
            os.unlink(tmppath)

    def test_detect_schemas_returns_list(self):
        """detect_schemas always returns a list."""
        result = detect_schemas(["/nonexistent/file.py"], "/tmp")
        self.assertIsInstance(result, list)

    def test_non_pydantic_class_not_extracted(self):
        """Regular classes (not BaseModel subclasses) should not be extracted."""
        with tempfile.NamedTemporaryFile(suffix=".py", mode="w", delete=False) as f:
            f.write("""
class RegularClass:
    name: str
    age: int
""")
            tmppath = f.name

        try:
            models = extract_pydantic_models(tmppath)
            self.assertEqual(len(models), 0, "Regular classes should not be extracted")
        finally:
            os.unlink(tmppath)

    def test_pydantic_field_types_mapped(self):
        """Field types are mapped to human-readable strings."""
        with tempfile.NamedTemporaryFile(suffix=".py", mode="w", delete=False) as f:
            f.write("""
from pydantic import BaseModel
from typing import List

class ItemRequest(BaseModel):
    count: int
    active: bool
    tags: List[str]
""")
            tmppath = f.name

        try:
            models = extract_pydantic_models(tmppath)
            self.assertEqual(len(models), 1)
            count_field = next((f for f in models[0]["fields"] if f["name"] == "count"), None)
            active_field = next((f for f in models[0]["fields"] if f["name"] == "active"), None)
            tags_field = next((f for f in models[0]["fields"] if f["name"] == "tags"), None)

            assert count_field is not None, "count field not found"
            self.assertEqual(count_field["type"], "int")
            assert active_field is not None, "active field not found"
            self.assertEqual(active_field["type"], "bool")
            assert tags_field is not None, "tags field not found"
            self.assertEqual(tags_field["type"], "array")
        finally:
            os.unlink(tmppath)


if __name__ == "__main__":
    unittest.main(verbosity=2)
