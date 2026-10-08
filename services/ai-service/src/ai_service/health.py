"""Liveness and readiness probes. Readiness gains checks as dependencies arrive."""

from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/health", tags=["health"])


class LiveResponse(BaseModel):
    status: Literal["ok"] = "ok"


class ReadyResponse(BaseModel):
    status: Literal["ok", "error"]
    checks: dict[str, Literal["up", "down"]]


@router.get("/live")
def live() -> LiveResponse:
    return LiveResponse()


@router.get("/ready")
def ready() -> ReadyResponse:
    return ReadyResponse(status="ok", checks={})
