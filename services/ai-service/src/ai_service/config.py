"""Environment configuration, validated once at startup."""

from collections.abc import Mapping
from typing import Literal, Self

from pydantic import Field, SecretStr, ValidationError, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

Environment = Literal["development", "test", "production"]
LogLevel = Literal["DEBUG", "INFO", "WARNING", "ERROR"]
LlmProviderName = Literal["anthropic", "fake"]


class ConfigError(Exception):
    """Invalid environment. The message names variables and rules, never values."""

    def __init__(self, problems: str) -> None:
        super().__init__(f"Invalid environment configuration: {problems}")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="AI_SERVICE_", frozen=True, extra="ignore")

    environment: Environment = Field(default="development", alias="AI_SERVICE_ENV")
    port: int = Field(default=8000, ge=1, le=65535)
    log_level: LogLevel = "INFO"
    # Bearer token callers present on /v1 routes (ADR-0028). Unset outside production, every
    # /v1 request is refused.
    token: SecretStr | None = Field(default=None, min_length=32)
    llm_provider: LlmProviderName = "fake"
    llm_model: str = Field(default="claude-opus-5-5", min_length=1)
    llm_timeout_seconds: float = Field(default=30, gt=0, le=300)
    llm_max_retries: int = Field(default=2, ge=0, le=5)
    anthropic_api_key: SecretStr | None = Field(default=None, min_length=1)

    @field_validator("log_level", mode="before")
    @classmethod
    def _upper(cls, value: object) -> object:
        return value.upper() if isinstance(value, str) else value

    @model_validator(mode="after")
    def _required_together(self) -> Self:
        if self.llm_provider == "anthropic" and self.anthropic_api_key is None:
            msg = "AI_SERVICE_ANTHROPIC_API_KEY is required with the anthropic provider"
            raise ValueError(msg)
        if self.environment == "production":
            if self.llm_provider == "fake":
                msg = "AI_SERVICE_LLM_PROVIDER cannot be fake in production"
                raise ValueError(msg)
            if self.token is None:
                msg = "AI_SERVICE_TOKEN is required in production"
                raise ValueError(msg)
        return self


def load_settings(env: Mapping[str, str]) -> Settings:
    """Reads settings from `env` only (not from the process), so callers decide the source."""
    values = {key: value for key, value in env.items() if key.startswith("AI_SERVICE_")}
    try:
        return Settings.model_validate(_by_field(values))
    except ValidationError as error:
        problems = "; ".join(
            _describe(issue["loc"], issue["type"], issue["msg"]) for issue in error.errors()
        )
        raise ConfigError(problems) from None


def _by_field(values: Mapping[str, str]) -> dict[str, str]:
    by_field: dict[str, str] = {}
    for name, field in Settings.model_fields.items():
        variable = field.alias or f"AI_SERVICE_{name.upper()}"
        if variable in values:
            by_field[field.alias or name] = values[variable]
    return by_field


def _describe(loc: tuple[int | str, ...], kind: str, message: str) -> str:
    if not loc:
        # Cross-field rules raise our own messages, which name variables and never values.
        return message.removeprefix("Value error, ")
    name = str(loc[0])
    variable = name if name.startswith("AI_SERVICE_") else f"AI_SERVICE_{name.upper()}"
    return f"{variable}: {kind}"
