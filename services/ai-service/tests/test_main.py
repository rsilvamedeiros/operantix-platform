from ai_service.config import load_settings
from ai_service.llm import AnthropicProvider, FakeProvider
from ai_service.main import build_provider


def test_builds_the_configured_provider() -> None:
    fake = load_settings({"AI_SERVICE_ENV": "test"})
    anthropic = load_settings(
        {
            "AI_SERVICE_ENV": "test",
            "AI_SERVICE_LLM_PROVIDER": "anthropic",
            "AI_SERVICE_ANTHROPIC_API_KEY": "k" * 24,
        }
    )

    assert isinstance(build_provider(fake), FakeProvider)
    assert isinstance(build_provider(anthropic), AnthropicProvider)
