# Claude Code Workflow

O repositório foi preparado para sessões longas sem depender de prompt repetitivo.

## Layers

- `CLAUDE.md`: invariantes e protocolo sempre relevantes.
- `.claude/rules/`: convenções modulares, algumas carregadas por path.
- `.claude/skills/`: workflows sob demanda.
- `.claude/agents/`: revisão especializada em contexto isolado.

## Recommended first session

```text
Leia CLAUDE.md e docs/00-start-here.md.
Depois execute /plan-module docs/workflow/module-00-foundation.md.
Não implemente módulos posteriores.
```

## During implementation

Use uma skill específica para cada tipo de mudança. Evite copiar toda a documentação para o prompt; peça ao Claude para abrir somente referências indicadas pelo módulo.

## End of session

Execute `/review-changes`, resolva achados relevantes, atualize docs e então `/prepare-commit`.
