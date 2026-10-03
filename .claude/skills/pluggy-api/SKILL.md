---
name: pluggy-api
description: Como este projeto fala com a API da Pluggy (Meu Pluggy, Open Finance PF). Use ao mexer em api/src/gastos/ingest/pluggy_*.py, ao mapear campos de transacao/fatura ou ao escrever fixtures no formato da API.
---

# Pluggy API (Meu Pluggy, uso pessoal)

Fonte viva: MCP `pluggy-docs` (sem chave) ou https://docs.pluggy.ai/pt/reference. Em duvida, consulte antes de codar.

## Autenticacao
- `POST https://api.pluggy.ai/auth` body `{"clientId","clientSecret"}` -> `{"apiKey"}`. Valida por **2 horas**.
  Renovar sob 401 ou quando passar de ~110 min. Header em todas as chamadas: `X-API-KEY`.
- Credenciais vem do `.env` (`PLUGGY_CLIENT_ID`, `PLUGGY_CLIENT_SECRET`). Nunca em codigo, log ou fixture.

## Limites do Meu Pluggy (gratis)
- Ate 5 conexoes (items), todas da mesma pessoa. Uso pessoal.
- Items sincronizam **1x por dia** e **nao aceitam update forcado** via API. Nao chame `PATCH /items/{id}`.
- Item ids vem do dashboard (dashboard.pluggy.ai) e ficam em `PLUGGY_ITEM_IDS`. Trate como segredo.
- Historico inicial via Open Finance costuma ser ~12 meses. Para mais antigo, usar import OFX/CSV.

## Endpoints usados
| Chamada | Uso |
|---|---|
| `GET /items/{id}` | status da conexao (`status`: UPDATED, OUTDATED, LOGIN_ERROR, WAITING_USER_INPUT...) |
| `GET /accounts?itemId=` | contas do item. `type`: `BANK` ou `CREDIT`. `subtype`: CHECKING_ACCOUNT, SAVINGS_ACCOUNT, CREDIT_CARD |
| `GET /transactions?accountId=&from=YYYY-MM-DD&to=YYYY-MM-DD&page=&pageSize=500` | paginado (`results`, `page`, `totalPages`). Janela de ate 90 dias por chamada |
| `GET /bills?accountId=` | faturas do cartao. `totalAmount` da fatura fechada e **autoritativo** (vale mais que a soma das transacoes) |
| `GET /categories` | 50+ categorias PT-BR com `id`, `description`, `parentId` |

## Campos de transacao -> `transactions`
- `id` -> `external_id`; `date` (ISO) -> `date`; `description` -> `description`; `amount` -> `amount`
  (Pluggy: positivo = credito, negativo = debito; manter o sinal como veio);
- `type` (`DEBIT`/`CREDIT`) -> `type`; `category` / `categoryId` -> `pluggy_category`;
- `creditCardMetadata.installmentNumber` / `.totalInstallments` -> `installment_n` / `installment_total`;
  `creditCardMetadata.billId` + fatura -> `bill_month`;
- `status` `PENDING` deve ser reprocessado em sync futuro (so vira `POSTED` depois);
- objeto inteiro -> `raw_json` (nunca sai do banco local nem vai para o LLM).

## Regras de sync (licoes de projetos anteriores)
1. Upsert por `external_id`. **Nunca deletar** transacao ausente num re-sync.
2. Camada do usuario (categoria manual, regra, exclusao) vive em tabelas separadas e sobrevive ao sync.
3. Janela de sync: ultimos 90 dias por padrao; `--desde` para backfill. Guardar `last_sync_at` por conta.
4. Erros de item (LOGIN_ERROR, WAITING_USER_INPUT) nao sao bug do codigo: logar e seguir para o proximo item.
5. Testes nunca chamam a API. Fixtures em `api/tests/fixtures/pluggy/*.json` com dados sinteticos no formato acima.

## Pluggy Connect (widget)
- Backend gera o token: `POST /connect_token` (X-API-KEY) body `{"options": {"clientUserId": "..."}}`; com `"itemId"` o widget abre em modo de atualizacao de conexao. Resposta `accessToken`, valido por poucos minutos: gerar um por abertura do widget, nunca guardar.
- Ao concluir, o front envia o `item.id` para `POST /pluggy/items`; ele fica na tabela `pluggy_items` (so no banco local, nunca devolvido pela API; a lista usa id interno).
- O sync usa a uniao de `PLUGGY_ITEM_IDS` (.env) com `pluggy_items`, sem duplicar (`itens_para_sync`). Status e nome do conector dos itens do widget sao gravados a cada sync.
- Bancos reais pelo widget exigem plano pago da Pluggy; no plano gratis so o conector sandbox funciona. Para bancos reais gratis, siga o fluxo Meu Pluggy + `PLUGGY_ITEM_IDS`.
