import pytest

from ai_service.config import ConfigError, load_settings

# Test values are built at runtime so no credential-like literal lives in the repository.
TOKEN = "t" * 32
API_KEY = "k" * 24
PRODUCTION = {
    "AI_SERVICE_ENV": "production",
    "AI_SERVICE_TOKEN": TOKEN,
    "AI_SERVICE_LLM_PROVIDER": "anthropic",
    "AI_SERVICE_ANTHROPIC_API_KEY": API_KEY,
}


def test_applies_defaults() -> None:
    settings = load_settings({})

    assert settings.environment == "development"
    assert settings.port == 8000
    assert settings.log_level == "INFO"
    assert settings.llm_provider == "fake"
    assert settings.llm_model == "claude-opus-5-5"
    assert settings.llm_timeout_seconds == 30
    assert settings.llm_max_retries == 2
    assert settings.token is None
    assert settings.anthropic_api_key is None


def test_reads_the_environment() -> None:
    settings = load_settings(
        PRODUCTION | {"AI_SERVICE_PORT": "9000", "AI_SERVICE_LOG_LEVEL": "debug"}
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


def test_reads_the_llm_settings_and_keeps_secrets_out_of_repr() -> None:
    settings = load_settings(
        PRODUCTION
        | {
            "AI_SERVICE_LLM_MODEL": "claude-sonnet-5-5",
            "AI_SERVICE_LLM_TIMEOUT_SECONDS": "12.5",
            "AI_SERVICE_LLM_MAX_RETRIES": "0",
        }
    )

    assert settings.llm_provider == "anthropic"
    assert settings.llm_model == "claude-sonnet-5-5"
    assert settings.llm_timeout_seconds == 12.5
    assert settings.llm_max_retries == 0
    assert settings.token is not None
    assert settings.token.get_secret_value() == TOKEN
    assert settings.anthropic_api_key is not None
    assert settings.anthropic_api_key.get_secret_value() == API_KEY
    assert TOKEN not in repr(settings)
    assert API_KEY not in repr(settings)


@pytest.mark.parametrize(
    ("name", "value"),
    [
        ("AI_SERVICE_LLM_PROVIDER", "openai"),
        ("AI_SERVICE_LLM_MODEL", ""),
        ("AI_SERVICE_LLM_TIMEOUT_SECONDS", "0"),
        ("AI_SERVICE_LLM_TIMEOUT_SECONDS", "301"),
        ("AI_SERVICE_LLM_MAX_RETRIES", "6"),
        ("AI_SERVICE_TOKEN", "short-token-value"),
    ],
)
def test_rejects_invalid_llm_and_token_values(name: str, value: str) -> None:
    with pytest.raises(ConfigError) as error:
        load_settings({name: value})

    assert name in str(error.value)
    if value:
        assert value not in str(error.value)


@pytest.mark.parametrize(
    ("missing", "named"),
    [
        ("AI_SERVICE_TOKEN", "AI_SERVICE_TOKEN"),
        ("AI_SERVICE_ANTHROPIC_API_KEY", "AI_SERVICE_ANTHROPIC_API_KEY"),
    ],
)
def test_production_requires_its_secrets(missing: str, named: str) -> None:
    env = {key: value for key, value in PRODUCTION.items() if key != missing}

    with pytest.raises(ConfigError) as error:
        load_settings(env)

    assert named in str(error.value)


def test_production_refuses_the_fake_provider() -> None:
    with pytest.raises(ConfigError) as error:
        load_settings(PRODUCTION | {"AI_SERVICE_LLM_PROVIDER": "fake"})

    assert "AI_SERVICE_LLM_PROVIDER" in str(error.value)


def test_the_anthropic_provider_requires_a_key_in_any_environment() -> None:
    with pytest.raises(ConfigError) as error:
        load_settings({"AI_SERVICE_LLM_PROVIDER": "anthropic"})

    assert "AI_SERVICE_ANTHROPIC_API_KEY" in str(error.value)
