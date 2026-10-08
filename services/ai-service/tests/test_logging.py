import json
import logging

from ai_service.logging import JsonFormatter


def render(record: logging.LogRecord) -> dict[str, object]:
    rendered: dict[str, object] = json.loads(JsonFormatter().format(record))
    return rendered


def make_record(**extra: object) -> logging.LogRecord:
    record = logging.LogRecord(
        "ai_service.llm", logging.INFO, __file__, 1, "llm generation", (), None
    )
    record.__dict__.update(extra)
    return record


def test_renders_one_json_object_with_the_structured_fields() -> None:
    line = render(make_record(fields={"model": "m", "inputTokens": 3}))

    assert line["level"] == "info"
    assert line["logger"] == "ai_service.llm"
    assert line["msg"] == "llm generation"
    assert line["model"] == "m"
    assert line["inputTokens"] == 3
    assert isinstance(line["time"], str)


def test_includes_the_exception_type_but_not_its_traceback_text() -> None:
    try:
        raise ValueError("boom")  # noqa: TRY301 - building a real exc_info
    except ValueError:
        import sys

        record = make_record()
        record.exc_info = sys.exc_info()

    line = render(record)

    assert line["error"] == "ValueError"
    assert "Traceback" not in json.dumps(line)
