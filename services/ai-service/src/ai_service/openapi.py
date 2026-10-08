"""Writes the committed contract: uv run python -m ai_service.openapi"""

import json
from pathlib import Path
from typing import Any

from ai_service.config import Settings
from ai_service.main import create_app


def build_openapi_document() -> dict[str, Any]:
    return create_app(Settings.model_validate({"AI_SERVICE_ENV": "test"})).openapi()


if __name__ == "__main__":  # pragma: no cover
    target = Path(__file__).resolve().parents[2] / "openapi.json"
    target.write_text(json.dumps(build_openapi_document(), indent=2) + "\n", encoding="utf-8")
