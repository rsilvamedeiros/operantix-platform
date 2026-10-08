import pytest

from ai_service.llm import estimate_cost_usd


@pytest.mark.parametrize(
    ("model", "expected"),
    [
        ("claude-opus-5-5", 0.0108),  # 1200 x $4/M + 300 x $20/M
        ("claude-sonnet-5-5", 0.0054),
        ("claude-haiku-5-5", 0.00027),
    ],
)
def test_estimates_the_cost_of_known_models(model: str, expected: float) -> None:
    assert estimate_cost_usd(model, input_tokens=1200, output_tokens=300) == pytest.approx(expected)


def test_does_not_guess_the_cost_of_unknown_models() -> None:
    assert estimate_cost_usd("some-other-model", input_tokens=1200, output_tokens=300) is None
