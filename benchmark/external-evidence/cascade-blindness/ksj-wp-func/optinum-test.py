# Optinum generates this from: changeType=cascade-change, pattern=cascade-blindness
# Source repo: https://github.com/jurjans/ksj-wp-func
# Commit: e735faf (buggy) → fa07622 (restored)
# AI tool: Claude Code (co-authored dead-code removal commit)
# Gap: Claude removed get_model() as "dead code" from function_app.py.
#      fb_gen.py imported it with `from function_app import get_model`.
#      The import exists in a separate file — outside Claude's diff context.
#      Two separate restore commits were required to fix two separate endpoints
#      deleted in the same pattern across different refactors.

import pytest
import importlib
import sys


def test_get_model_importable_from_function_app():
    """
    Blast radius check: get_model must remain importable from function_app.
    Claude's dead-code removal deleted it because it appeared unused at the
    module level — but fb_gen.py imports it from this module.
    AI code: raises ImportError — get_model does not exist in function_app
    Correct code: import succeeds, function is callable
    """
    try:
        from function_app import get_model
    except ImportError:
        pytest.fail(
            "get_model is not defined in function_app.py — "
            "fb_gen.py imports it; removing it breaks all FB copy generation. "
            "This is a cascade-blindness failure: the function appeared unused "
            "at the module level but had a cross-file caller."
        )
    assert callable(get_model), "get_model must be callable"


def test_generate_fb_copy_endpoint_does_not_raise_name_error(mock_request):
    """
    Integration: generate_fb_copy endpoint must not raise NameError.
    After Claude's removal, calling the endpoint raised:
      NameError: name 'get_model' is not defined
    inside fb_gen.generate_copy().
    """
    import function_app
    try:
        function_app.generate_fb_copy(mock_request)
    except NameError as e:
        pytest.fail(
            f"NameError in generate_fb_copy: {e}\n"
            "This confirms cascade-blindness: a function was deleted from one file "
            "while its caller in another file was not updated."
        )


def test_all_endpoints_registered(app_routes):
    """
    Verify all expected HTTP routes are registered in function_app.
    Claude removed generate_content_plan in a second refactor.
    Optinum's blast radius scan lists all route registrations and
    fails if any are missing after a refactor commit.
    """
    expected_routes = {"generate_fb_copy", "generate_content_plan", "wp_job_tick"}
    registered = {r["route"] for r in app_routes}
    missing = expected_routes - registered
    assert not missing, (
        f"Missing endpoints after refactor: {missing}\n"
        "Claude's dead-code removal pattern deleted endpoint registrations "
        "that appeared unused in the diff context."
    )
