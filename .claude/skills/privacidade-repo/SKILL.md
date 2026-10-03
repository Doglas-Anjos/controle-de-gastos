---
name: privacidade-repo
description: Checklist de privacidade deste repositorio publico. Use antes de qualquer commit, ao criar fixtures, ao escrever README/screenshots, ao montar prompts para o LLM e ao adicionar logs.
---

# Privacidade: o repo e publico, os dados sao do usuario

## Nunca entra no repositorio
- Extratos, faturas, OFX/CSV/XLSX reais, bancos SQLite (`data/` inteiro).
- `.env`, credenciais Pluggy, item ids Pluggy, chave OpenAI, tokens.
- Nome completo, CPF, agencia/conta, numero de cartao, endereco, e-mail pessoal do usuario.
- Screenshots com dados reais. Screenshots so em modo demo (`gastos demo-seed`).

## Barreiras ja existentes (nao remova, estenda)
- `.gitignore` bloqueia `data/`, `.env`, `*.db`, `*.ofx`, `*.csv` (excecao: `api/tests/fixtures/**`).
- `scripts/check_no_personal_data.py` roda no pre-commit e no hook do Claude Code em `git commit/push`.
- `.gitleaks.toml` com regras de CPF, Pluggy e OpenAI. CI roda gitleaks.
- `.claude/settings.json` nega leitura de `.env` e `data/` aos agentes. **Nao contorne** com `cat`, `python -c open(...)` ou similares. Se precisar de dado para depurar, gere sintetico.

## Fixtures e testes
- Sempre sinteticos e deterministicos (`scripts/gen_fixtures.py`, seed fixa, sem Faker).
- Comerciantes ficticios ("Mercado Exemplo", "Streaming Alfa"). Bancos podem ser nomeados ("Nubank", "Inter") porque sao publicos, mas sem agencia/conta.
- CPF em fixture so como `000.000.000-00`.

## O que pode ir para o LLM (OpenAI)
Somente o resumo produzido por `insights/redact.py`: totais por categoria e mes, nomes normalizados de comerciantes (ou pseudonimos se `INSIGHTS_PSEUDONIMIZAR=true`), recorrencias (nome, valor, periodicidade), previsao, anomalias.
Proibido: `raw_json`, `external_id`, ids de conta/item, numero de cartao, saldo com identificacao de conta, nome do titular.
Ha teste que falha se qualquer campo proibido aparecer no payload.

## Logs
Nivel INFO nunca imprime transacao individual. DEBUG pode imprimir `description_norm` e valor, nunca `raw_json`.

## Antes de publicar / push
1. `python scripts/check_no_personal_data.py` (staged) e `git log -p | python scripts/check_no_personal_data.py --history`.
2. `gitleaks detect --config .gitleaks.toml`.
3. Subagente `auditor-privacidade` revisa README, fixtures e codigo novo.
