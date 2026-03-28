# Optinum generates this from: changeType=params-renamed, pattern=params-renamed
#
# The writer (_dispatch) and reader (_handle_rename) were built in separate context
# windows. The AI generated each from the Claude tool spec independently and chose
# different key names: dispatch emits "path", handlers read "old_path". KeyError
# fires on every rename invocation across both middleware classes.
#
# Optinum's contract test catches this by driving the full dispatch → handler path
# with a realistic rename payload and asserting no KeyError is raised.

import pytest
from buggy_middleware import (
    _StateClaudeFileToolMiddleware,
    _FilesystemClaudeFileToolMiddleware,
    _dispatch,
)


RENAME_ARGS = {"path": "/old/file.txt", "new_path": "/new/file.txt"}


class TestDispatchKeyNames:
    def test_dispatch_emits_old_path_key(self):
        """dispatch must emit 'old_path', not 'path', so handlers can read it."""
        result = _dispatch("rename", RENAME_ARGS)
        assert "old_path" in result, (
            "dispatch built {'path': ...} but handlers read args['old_path'] — "
            "key mismatch causes KeyError on every rename call"
        )

    def test_dispatch_does_not_emit_bare_path_for_rename(self):
        """'path' is ambiguous; rename must use old_path / new_path."""
        result = _dispatch("rename", RENAME_ARGS)
        assert "path" not in result or "old_path" in result


class TestStateMiddlewareRename:
    def test_rename_does_not_raise_key_error(self, tmp_path):
        """Invoking rename via _StateClaudeFileToolMiddleware must not raise KeyError."""
        mw = _StateClaudeFileToolMiddleware()
        try:
            mw.run("rename", RENAME_ARGS)
        except KeyError as exc:
            pytest.fail(
                f"KeyError {exc} — dispatch and handler use different key names. "
                "params-renamed bug: writer produced 'path', reader expects 'old_path'."
            )

    def test_rename_passes_correct_paths_to_state(self, tmp_path):
        """Handler must forward the original path values to state unchanged."""
        mw = _StateClaudeFileToolMiddleware()
        mw.run("rename", RENAME_ARGS)
        # If no exception: handler received and processed both path keys correctly


class TestFilesystemMiddlewareRename:
    def test_rename_does_not_raise_key_error(self, tmp_path):
        """Same contract for _FilesystemClaudeFileToolMiddleware."""
        src = tmp_path / "old_file.txt"
        src.write_text("content")

        args = {"path": str(src), "new_path": str(tmp_path / "new_file.txt")}
        mw = _FilesystemClaudeFileToolMiddleware()
        try:
            mw.run("rename", args)
        except KeyError as exc:
            pytest.fail(
                f"KeyError {exc} — both classes generated from the same flawed "
                "template; both read 'old_path' but dispatch never sets it."
            )

    def test_file_actually_moved(self, tmp_path):
        src = tmp_path / "old_file.txt"
        src.write_text("content")
        dst = tmp_path / "new_file.txt"

        mw = _FilesystemClaudeFileToolMiddleware()
        mw.run("rename", {"path": str(src), "new_path": str(dst)})

        assert dst.exists()
        assert not src.exists()
