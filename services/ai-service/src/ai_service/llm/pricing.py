"""Estimated cost per call, from list prices in USD per million tokens."""

# (input, output). Keep in step with the provider's price list; an outdated row only skews the
# estimate, never what is billed.
_PRICES_PER_MILLION: dict[str, tuple[float, float]] = {
    "claude-opus-5-5": (4.00, 20.00),
    "claude-sonnet-5-5": (2.00, 10.00),
    "claude-haiku-5-5": (0.10, 0.50),
}


def estimate_cost_usd(model: str, *, input_tokens: int, output_tokens: int) -> float | None:
    """None when the model has no listed price: no estimate beats a wrong one."""
    prices = _PRICES_PER_MILLION.get(model)
    if prices is None:
        return None
    input_price, output_price = prices
    return round((input_tokens * input_price + output_tokens * output_price) / 1_000_000, 8)
