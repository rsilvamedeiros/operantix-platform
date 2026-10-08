"""JSON log lines, like the Node workloads, with structured fields and no tracebacks."""

import json
import logging
from datetime import UTC, datetime


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        line: dict[str, object] = {
            "time": datetime.fromtimestamp(record.created, UTC).isoformat(),
            "level": record.levelname.lower(),
            "logger": record.name,
            "msg": record.getMessage(),
        }
        fields = record.__dict__.get("fields")
        if isinstance(fields, dict):
            line |= fields
        if record.exc_info and record.exc_info[0] is not None:
            # The type is enough to search for; messages and frames may quote request data.
            line["error"] = record.exc_info[0].__name__
        return json.dumps(line, default=str)


def configure_logging(level: str) -> None:
    handler = logging.StreamHandler()
    handler.setFormatter(JsonFormatter())
    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(level)
