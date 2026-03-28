# Optinum generates this from: changeType=cascade-change, pattern=cascade-blindness
#
# Authorization was implemented for one path (user membership check in require_permission)
# but the cascade caller (key-scoped org validation in handle_request) was a separate
# code path the AI did not traverse. org_id is stored on the key record and returned by
# validate_api_key, but discarded before reaching require_permission.
#
# Optinum's test exercises the cross-org scenario: key minted for org_A, user is also
# a member of org_B, request targets org_B. Must be DENIED — currently ALLOWED.

import pytest
from buggy_authorization import (
    _KEY_STORE,
    _ORG_MEMBERS,
    handle_request,
    require_permission,
    validate_api_key,
)

ORG_A = "org-alpha"
ORG_B = "org-beta"
USER = "user-123"
KEY_FOR_ORG_A = "key-abc-issued-for-org-a"


def _setup_cross_org_scenario():
    """Key issued for org_A; user is also a member of org_B."""
    _KEY_STORE[KEY_FOR_ORG_A] = {"user_id": USER, "org_id": ORG_A, "scopes": ["read"]}
    _ORG_MEMBERS[ORG_A] = {USER}
    _ORG_MEMBERS[ORG_B] = {USER}   # user is legitimately a member of org_B


def _teardown():
    _KEY_STORE.clear()
    _ORG_MEMBERS.clear()


class TestKeyOrgScoping:
    def setup_method(self):
        _teardown()
        _setup_cross_org_scenario()

    def teardown_method(self):
        _teardown()

    def test_key_issued_for_org_a_cannot_access_org_b(self):
        """Core invariant: a key scoped to org_A must not grant access to org_B.

        Even if the user is a member of org_B, the key's org scope must be
        validated. Current implementation allows this — cascade-blindness bug.
        """
        allowed = handle_request(KEY_FOR_ORG_A, target_org_id=ORG_B)
        assert not allowed, (
            "Key issued for org_A was accepted for org_B — key org_id is stored "
            "but never checked in the authorization path. "
            "OpenHands issue #13464: cascade-blindness."
        )

    def test_key_issued_for_org_a_can_access_org_a(self):
        """Positive case: key used against its own org must be allowed."""
        allowed = handle_request(KEY_FOR_ORG_A, target_org_id=ORG_A)
        assert allowed, "Key issued for org_A must be accepted for org_A requests."

    def test_require_permission_receives_key_org_id(self):
        """require_permission must accept and validate key_org_id, not just user_id.

        If the function signature does not include key_org_id, the cascade is broken
        by design — the missing parameter proves the authz path is incomplete.
        """
        import inspect
        sig = inspect.signature(require_permission)
        params = list(sig.parameters.keys())
        assert "key_org_id" in params, (
            f"require_permission({', '.join(params)}) has no key_org_id parameter — "
            "the cascade from validate_api_key → require_permission drops org scoping. "
            "AI implemented membership check but missed the key-scope validation step."
        )

    def test_validate_api_key_exposes_org_id(self):
        """validate_api_key must return org_id so callers can enforce key scoping."""
        record = validate_api_key(KEY_FOR_ORG_A)
        assert "org_id" in record, "validate_api_key must return org_id in record"
        assert record["org_id"] == ORG_A

    def test_cross_org_with_non_member_user_also_denied(self):
        """User not in org_B should also be denied — baseline sanity check."""
        _ORG_MEMBERS[ORG_B] = set()   # remove user from org_B
        allowed = handle_request(KEY_FOR_ORG_A, target_org_id=ORG_B)
        assert not allowed
