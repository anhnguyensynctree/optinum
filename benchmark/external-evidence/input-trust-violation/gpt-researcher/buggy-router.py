# Source: https://github.com/assafelovic/gpt-researcher/issues/1695
# AI tool: gpt-researcher (README: "built using AI") — CVSS 9.8
#
# Gap: All 14 REST API endpoints + WebSocket have zero authentication.
# No Depends() injection, no HTTPBearer, no session check anywhere.
# Every AI-added endpoint inherited the no-auth baseline because the codebase
# had no auth to reference — AI generates new endpoints consistent with the
# existing style, which was consistently wrong.

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from pathlib import Path

router = APIRouter()

REPORTS_DIR = Path("outputs")


class ReportRequest(BaseModel):
    query: str
    report_type: str = "research_report"


# BUG: zero auth on all endpoints — CVSS 9.8
# AI inherited the no-auth pattern from the existing codebase baseline.
# Every new endpoint added follows the same pattern: no Depends(), no bearer
# check, no session validation. The model has no in-context example of auth
# to copy from, so it produces endpoints that work — but are wide open.


@router.post("/report")
async def create_report(request: ReportRequest):
    # No auth dependency. Any caller — authenticated or not — can trigger
    # an LLM research run, consuming API credits and compute.
    result = {"query": request.query, "report": "...generated content..."}
    return result


@router.get("/files/{filename}")
async def get_file(filename: str):
    # No auth dependency. Any caller can read any file in outputs/.
    # Path traversal is also unmitigated, but zero-auth is the root issue.
    file_path = REPORTS_DIR / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    return {"filename": filename, "content": file_path.read_text()}


@router.delete("/files/{filename}")
async def delete_file(filename: str):
    # No auth dependency. Any caller can delete any output file.
    file_path = REPORTS_DIR / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    file_path.unlink()
    return {"deleted": filename}
