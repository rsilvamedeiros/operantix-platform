"""Versioned prompts (docs/ai/prompt-management.md). A changed prompt is a new file and version."""

from importlib.resources import files

from ai_service.llm import Prompt


def load_prompt(capability: str, version: int) -> Prompt:
    system = files(__package__).joinpath(f"{capability}.v{version}.md").read_text(encoding="utf-8")
    return Prompt(capability=capability, version=version, system=system.strip())
