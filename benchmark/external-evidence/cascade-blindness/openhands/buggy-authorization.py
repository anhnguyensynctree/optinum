# Source: https://github.com/All-Hands-AI/OpenHands/issues/13464
# AI tool: OpenHands itself — this is a bug in the AI coding agent's own authorization layer
#
# Gap: validate_api_key() returns user_id and org_id from the stored key record.
# require_permission() checks that the user is a member of the target org — but never
# verifies that the API key was issued FOR that org. A key minted for org_A can be used
# to access org_B resources if the key's user happens to be a member of org_B.
#
# The fix path (membership check) was implemented. The cascade path (key-scoped org
# validation) was a separate code path the AI did not traverse. org_id is stored in the
# key record and returned by validate_api_key but is only used for display, not authz.

from typing import TypedDict


class ApiKeyRecord(TypedDict):
    user_id: str
    org_id: str      # org this key was minted for — stored, but never used for authz
    scopes: list[str]


# Simulated key store: key → record
_KEY_STORE: dict[str, ApiKeyRecord] = {}

# Simulated org membership: org_id → set of user_ids
_ORG_MEMBERS: dict[str, set[str]] = {}


def validate_api_key(key: str) -> ApiKeyRecord:
    """Validate key and return its associated record.

    Returns user_id and org_id. Callers receive both fields but the authorization
    layer only threads user_id into require_permission — org_id is discarded.
    """
    record = _KEY_STORE.get(key)
    if record is None:
        raise ValueError("Invalid API key")
    return record


def require_permission(user_id: str, target_org_id: str) -> bool:
    """Return True if user is a member of target_org_id.

    BUG: checks user membership in the target org, but does NOT verify that the
    API key used to authenticate was issued for that org. A key minted for org_A
    grants access to org_B if the user belongs to org_B.

    The key's org_id (returned by validate_api_key) is never passed here.
    """
    members = _ORG_MEMBERS.get(target_org_id, set())
    return user_id in members


def handle_request(api_key: str, target_org_id: str) -> bool:
    """Authenticate via API key and authorize against target org.

    The cascade: validate_api_key returns both user_id and key_org_id,
    but only user_id is forwarded to require_permission. key_org_id is silently
    dropped — the AI implemented the membership check but missed the key-scoping step.
    """
    record = validate_api_key(api_key)
    user_id = record["user_id"]
    # BUG: record["org_id"] (key_org_id) is available here but never used
    return require_permission(user_id, target_org_id)
