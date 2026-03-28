# Source: https://github.com/langchain-ai/langchain/issues/35852
# Fix:    https://github.com/langchain-ai/langchain/pull/36331
#
# Gap: AI generated the dispatch function and both _handle_rename methods from the
# same tool spec but in separate context windows. Dispatch builds {"path": path},
# handlers read args["old_path"]. KeyError on every rename call.
# Both classes share the identical bug because they were generated from the same
# flawed template — neither context window saw the other's key name choice.

from typing import Any


def _dispatch(tool_name: str, args: dict[str, Any]) -> dict[str, Any]:
    """Route a Claude tool call to the appropriate handler.

    BUG: rename branch builds {"path": path} — never populates "old_path".
    The writer (dispatch) and the reader (_handle_rename) were generated
    independently from the tool spec; the AI chose different key names each time.
    """
    if tool_name == "rename":
        path = args.get("path", "")
        new_path = args.get("new_path", "")
        # BUG: should be {"old_path": path, "new_path": new_path}
        return {"path": path, "new_path": new_path}
    return args


class _StateClaudeFileToolMiddleware:
    """Middleware that wraps Claude's file tools for in-memory state tracking."""

    def _handle_rename(self, args: dict[str, Any]) -> None:
        # BUG: reads "old_path" — key never present; dispatch sends "path"
        old = args["old_path"]   # KeyError on every call
        new = args["new_path"]
        self._state.rename(old, new)

    def run(self, tool_name: str, args: dict[str, Any]) -> Any:
        dispatched = _dispatch(tool_name, args)
        if tool_name == "rename":
            self._handle_rename(dispatched)


class _FilesystemClaudeFileToolMiddleware:
    """Middleware that wraps Claude's file tools for real filesystem operations."""

    def _handle_rename(self, args: dict[str, Any]) -> None:
        # Same template, same bug — AI regenerated the handler and chose "old_path"
        # again without seeing the dispatch function produced "path"
        old = args["old_path"]   # KeyError on every call
        new = args["new_path"]
        import os
        os.rename(old, new)

    def run(self, tool_name: str, args: dict[str, Any]) -> Any:
        dispatched = _dispatch(tool_name, args)
        if tool_name == "rename":
            self._handle_rename(dispatched)
