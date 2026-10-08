# AI Evaluation

Criar datasets de avaliação versionados por capability. Medir schema validity, task correctness, groundedness quando aplicável, latency e cost. Mudança de prompt/model relevante deve rodar eval antes de release.

## Implemented state

Each capability's dataset lives in `services/ai-service/evals/<capability>.v<prompt version>.jsonl`,
one case per line: `{"id", "text", "labels": [{"name", "description"}], "expected"}`. Cases are
synthetic; never paste customer data into a dataset. A new prompt version gets its own dataset file,
so results stay comparable across versions.

`classify-text@1` has 12 cases across support triage, lead qualification and incident routing,
including a Portuguese input and a prompt-injection attempt.

Run it from `services/ai-service`:

```bash
AI_SERVICE_LLM_PROVIDER=anthropic AI_SERVICE_ANTHROPIC_API_KEY=... \
  uv run python -m ai_service.evals classify-text --min-accuracy 0.9
```

The runner prints one JSON report with `promptVersion`, `provider`, `model`, `accuracy`,
`schemaValidRate`, `errors` (count per error code), `meanLatencyMs`, `totalCostUsd` and a per-case
`results` list. Failed calls count toward latency and, when tokens were spent, cost. Reports never
contain the input text. The exit code is 1 when accuracy is below `--min-accuracy`, so a release job
can gate on it.

The eval is not in CI: it calls a paid model, and CI has no provider key. With the default `fake`
provider it only checks that the runner works. Run it before releasing a prompt or model change.
