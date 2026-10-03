# Controle de Gastos

Controle financeiro pessoal. Repositorio **publico**; dados do usuario ficam so em `data/` e `.env` (gitignored).

## Stack e comandos
- `api/`: FastAPI, Python 3.11, SQLAlchemy 2.0, SQLite. Venv em `api/.venv`.
  - testes: `cd api && .venv/Scripts/python -m pytest -q`
  - servidor: `cd api && .venv/Scripts/python -m uvicorn gastos.api.main:app --reload`
  - CLI: `gastos sync | import <pasta> | demo-seed | recalcular`
- `web/`: Next.js 16 (app router), TypeScript, Tailwind 4, recharts, vitest.
  - `cd web && npx tsc --noEmit && npx vitest run`
- Tudo junto: `docker compose up`.

## Regras do projeto
1. Leia a skill certa antes de mexer: `pluggy-api` (ingestao), `dominio-financeiro` (regras de negocio),
   `privacidade-repo` (sempre, antes de commit). Elas sao a fonte de verdade; se a regra mudar, mude a skill.
2. Nunca leia `.env` nem `data/`. Dados de teste sao sinteticos (`scripts/gen_fixtures.py`).
3. Sync nunca apaga transacao; camada do usuario (overrides, regras, recorrencias) sobrevive ao sync.
4. Menos codigo (ponytail `full`): reutilize, use stdlib, evite dependencia nova. Rode `/ponytail-review` antes de PR.
5. Docstrings em portugues sem acento, explicando o porque e a tolerancia escolhida. Sem `Args:`/`Returns:`.
6. Antes de `git commit`/`push` o hook roda `scripts/check_no_personal_data.py`; nao contorne.

## Subagentes (em `.claude/agents/`)
`ingestao-bancaria` (Pluggy, OFX/CSV, routers, OpenAI client), `analista-financeiro` (normalizacao,
categorias, recorrencia, previsao, redacao, fixtures), `frontend-nextjs` (web/), `auditor-privacidade`
(somente leitura; roda ao fim de cada fase e antes de push). Orquestre com `subagent-driven-development`
e `dispatching-parallel-agents`; feche fases com `verification-before-completion`.
