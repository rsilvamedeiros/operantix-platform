import pytest

from ai_service.config import ConfigError, load_settings


def test_applies_defaults() -> None:
    settings = load_settings({})

    assert settings.environment == "development"
    assert settings.port == 8000
    assert settings.log_level == "INFO"


def test_reads_the_environment() -> None:
    settings = load_settings(
        {"AI_SERVICE_ENV": "production", "AI_SERVICE_PORT": "9000", "AI_SERVICE_LOG_LEVEL": "debug"}
    )

    assert settings.environment == "production"
    assert settings.port == 9000
    assert settings.log_level == "DEBUG"


@pytest.mark.parametrize(
    ("name", "value"),
    [("AI_SERVICE_PORT", "0"), ("AI_SERVICE_ENV", "staging"), ("AI_SERVICE_LOG_LEVEL", "LOUD")],
)
def test_rejects_invalid_values_naming_the_variable_but_not_the_value(
    name: str, value: str
) -> None:
    with pytest.raises(ConfigError) as error:
        load_settings({name: value})

    assert name in str(error.value)
    assert value not in str(error.value)
