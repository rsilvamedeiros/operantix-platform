"""Environment configuration, validated once at startup."""

from collections.abc import Mapping
from typing import Literal

from pydantic import Field, ValidationError, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

Environment = Literal["development", "test", "production"]
LogLevel = Literal["DEBUG", "INFO", "WARNING", "ERROR"]


class ConfigError(Exception):
    """Invalid environment. The message names variables and rules, never values."""

    def __init__(self, problems: str) -> None:
        super().__init__(f"Invalid environment configuration: {problems}")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="AI_SERVICE_", frozen=True, extra="ignore")

    environment: Environment = Field(default="development", alias="AI_SERVICE_ENV")
    port: int = Field(default=8000, ge=1, le=65535)
    log_level: LogLevel = "INFO"

    @field_validator("log_level", mode="before")
    @classmethod
    def _upper(cls, value: object) -> object:
        return value.upper() if isinstance(value, str) else value


def load_settings(env: Mapping[str, str]) -> Settings:
    """Reads settings from `env` only (not from the process), so callers decide the source."""
    values = {key: value for key, value in env.items() if key.startswith("AI_SERVICE_")}
    try:
        return Settings.model_validate(_by_field(values))
    except ValidationError as error:
        problems = "; ".join(
            f"{_variable(issue['loc'])}: {issue['type']}" for issue in error.errors()
        )
        raise ConfigError(problems) from None


def _by_field(values: Mapping[str, str]) -> dict[str, str]:
    by_field: dict[str, str] = {}
    for name, field in Settings.model_fields.items():
        variable = field.alias or f"AI_SERVICE_{name.upper()}"
        if variable in values:
            by_field[field.alias or name] = values[variable]
    return by_field


def _variable(loc: tuple[int | str, ...]) -> str:
    name = str(loc[0]) if loc else "?"
    return name if name.startswith("AI_SERVICE_") else f"AI_SERVICE_{name.upper()}"
