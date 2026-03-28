# Optinum generates this from: changeType=schema-migration, pattern=params-renamed + config-drift-across-files
#
# The migration correctly renames drivers → employees across all schema tables.
# The drift is in the docs: README still documents /api/v1/drivers and "Driver PIN
# authentication". Any developer following the README sends requests to a 404 endpoint.
#
# Optinum detects this by cross-referencing the migration's renamed identifiers against
# all documentation artifacts — README, API docs, changelogs. Schema rename ≠ done
# until docs are updated to match.

import re
from pathlib import Path

REPO_ROOT = Path(__file__).parent

# Stale identifiers left by the AI after the rename
STALE_ENDPOINT = "/api/v1/drivers"
STALE_TERM = "Driver PIN"

# Canonical identifiers post-migration
CANONICAL_ENDPOINT = "/api/v1/employees"


def _read_readme() -> str:
    candidates = list(REPO_ROOT.glob("**/README.md"))
    assert candidates, "No README.md found — cannot verify doc drift"
    return candidates[0].read_text()


class TestDocumentationDriftAfterMigration:
    def test_readme_does_not_reference_stale_drivers_endpoint(self):
        """README must not document the old /api/v1/drivers route post-migration."""
        content = _read_readme()
        assert STALE_ENDPOINT not in content, (
            f"README still documents '{STALE_ENDPOINT}' but the migration renamed "
            "drivers → employees. Developers following the README hit 404."
        )

    def test_readme_references_canonical_employees_endpoint(self):
        """README must document /api/v1/employees after the rename."""
        content = _read_readme()
        assert CANONICAL_ENDPOINT in content, (
            f"README does not document '{CANONICAL_ENDPOINT}' — "
            "migration ran but docs were not updated."
        )

    def test_readme_does_not_contain_driver_pin_terminology(self):
        """'Driver PIN' terminology must be updated to match the new entity name."""
        content = _read_readme()
        assert STALE_TERM not in content, (
            f"README still uses '{STALE_TERM}' — AI updated schema and code "
            "but did not traverse documentation artifacts."
        )

    def test_migration_rename_has_corresponding_doc_update(self):
        """Every table rename in a migration must have a matching doc artifact update.

        Optinum enforces: if a migration renames a table, at least one .md file
        must have been modified in the same commit (checked via git diff metadata
        or, here, by asserting the README contains the new name).
        """
        content = _read_readme()
        renamed_identifiers = ["employees", "employee_id"]
        missing = [ident for ident in renamed_identifiers if ident not in content]
        assert not missing, (
            f"Migration introduced {renamed_identifiers} but README is missing: "
            f"{missing}. Schema rename without doc update = config drift."
        )


class TestNoStaleIdentifiersInCodebase:
    def test_no_python_files_reference_drivers_table_by_string(self):
        """Python source must not hardcode the old table name after migration."""
        py_files = list(REPO_ROOT.glob("**/*.py"))
        # Exclude the migration itself and this test file
        stale = []
        for f in py_files:
            if "migration" in f.name or "optinum" in f.name:
                continue
            if re.search(r'["\']drivers["\']', f.read_text()):
                stale.append(str(f))
        assert not stale, (
            f"Files still reference 'drivers' table by string literal: {stale}"
        )
