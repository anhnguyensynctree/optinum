# Source: https://github.com/assafelovic/gpt-researcher/issues/1695
# AI tool: gpt-researcher (README: "built using AI") — CVSS 9.8
#
# Optinum generates this from: changeType=new-write-endpoint, pattern=input-trust-violation
#
# AI generated all endpoints consistently — consistently wrong. No auth in the
# codebase means no auth in any new endpoint. The model produces code that is
# internally coherent with its context window; the context window just happened
# to contain no auth pattern. Optinum's input-trust-violation detector fires on
# every new write endpoint regardless of codebase baseline and generates these
# 401 tests unconditionally.

import pytest
from httpx import AsyncClient, ASGITransport
from fastapi import FastAPI
from buggy_router import router

app = FastAPI()
app.include_router(router)


@pytest.fixture
def transport():
    return ASGITransport(app=app)


@pytest.mark.asyncio
async def test_post_report_requires_auth(transport):
    """POST /report must reject unauthenticated callers."""
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/report", json={"query": "test query"})
    # Fails on buggy router: returns 200 (no auth check at all)
    assert response.status_code == 401, (
        "POST /report is open to unauthenticated callers — any script can "
        "trigger LLM runs and consume API credits"
    )


@pytest.mark.asyncio
async def test_get_file_requires_auth(transport):
    """GET /files/{filename} must reject unauthenticated callers."""
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/files/report.md")
    # Fails on buggy router: returns 404 (file not found) — auth never checked
    assert response.status_code == 401, (
        "GET /files/{filename} is open — any caller can read research output files"
    )


@pytest.mark.asyncio
async def test_delete_file_requires_auth(transport):
    """DELETE /files/{filename} must reject unauthenticated callers."""
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.delete("/files/report.md")
    # Fails on buggy router: returns 404 (file not found) — auth never checked
    assert response.status_code == 401, (
        "DELETE /files/{filename} is open — any caller can destroy output files"
    )
