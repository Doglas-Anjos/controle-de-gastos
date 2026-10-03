---
name: dominio-financeiro
description: Regras de negocio deste projeto para normalizar descricoes, categorizar, detectar recorrencias (assinatura, parcela, detectada) e prever gastos. Fonte unica de verdade para api/src/gastos/domain/*. Use ao implementar ou alterar qualquer uma dessas regras ou seus testes.
---

# Dominio financeiro

Convencao de sinal: `amount` negativo = saida (gasto), positivo = entrada. Gasto = `-amount` quando `amount < 0`.

## Normalizacao (`normalize.py`)
`description_norm = normalizar(description)`:
1. lowercase, remover acentos (NFKD), trocar `*`, `-`, `_`, `/` por espaco;
2. remover tokens de parcela (`parc 03/12`, `3/12`, `parcela 3 de 12`), datas (`dd/mm`, `dd/mm/aa`), horarios, numeros com 3+ digitos, cidades/UF no fim (`sao paulo br`, `curitiba pr`);
3. remover prefixos de meio de pagamento (`pix enviado`, `compra no debito`, `pagamento`, `transferencia`, `ted`, `doc`) **mantendo** o resto;
4. colapsar espacos. Resultado vazio -> usar a descricao original em lowercase.
Guardar `installment_n` e `installment_total` quando o regex `(\d{1,2})\s*/\s*(\d{1,2})` ou `parcela N de M` casar e a Pluggy nao tiver informado.

## Categoria efetiva (`categorize.py`)
Prioridade: `transaction_overrides.category_id` > primeira `category_rules` por `priority` cujo regex casa em `description_norm` ou `description` > mapeamento de `pluggy_category` > `Sem categoria`.
`exclude=true` no override tira a transacao de totais, recorrencias e previsao (ex.: transferencia entre contas proprias). Transferencias entre contas do proprio usuario sao detectadas quando ha par (saida em A, entrada em B) com mesmo valor em ate 2 dias: marcar categoria `Transferencia` (kind `transferencia`) e excluir dos totais.

Categorias base (seed), `kind` entre parenteses: Moradia (fixo), Contas e servicos (fixo), Assinaturas (fixo), Alimentacao (variavel), Mercado (variavel), Transporte (variavel), Saude (variavel), Educacao (fixo), Lazer (variavel), Compras (variavel), Viagem (variavel), Impostos e taxas (fixo), Investimentos (transferencia), Transferencia (transferencia), Receita (receita), Sem categoria (variavel).

## Recorrencia (`recurrence.py`)
Entrada: transacoes nao excluidas, so gastos. Grupo = (`description_norm`, `account_id`).
Para grupo com >= 3 ocorrencias:
- `intervalo` = mediana das diferencas em dias entre datas ordenadas;
- periodicidade: semanal 6-8, mensal 28-33, anual 350-380; fora disso -> nao recorrente;
- tolerancia de valor: `cv = desvio_padrao / media` dos gastos; estavel se `cv < 0.15`;
- `expected_amount` = mediana; `expected_day` = mediana do dia do mes (mensal); `next_due` = ultima data + intervalo;
- `confidence` = min(1, 0.5 + 0.1 * (n - 3)) * (1.0 se estavel senao 0.7).
Tipo:
- `parcela`: `installment_total` presente. `expected_amount` = valor da parcela; `next_due` ate a ultima parcela (`installment_total - installment_n` restantes). Conta de cartao.
- `assinatura`: conta `credit`, mensal ou anual, estavel.
- `detectada`: qualquer outra recorrencia (Pix, debito, boleto, ou cartao sem valor estavel). E o que o usuario mais quer ver.
Grupo com >= 3 ocorrencias mas valores variando muito (`cv >= 0.15`) e ainda periodico vira `detectada` com confidence reduzida (ex.: conta de luz).
Usuario pode `confirmar` (active=true, confidence=1) ou `descartar` (active=false, nunca re-sugerir o mesmo grupo).
Recorrencia sem ocorrencia ha mais de 2 intervalos e marcada `active=false` automaticamente (encerrada).

## Previsao (`forecast.py`), v1
Para cada um dos proximos `h` meses (padrao 3) e cada categoria:
- parte fixa = soma de `expected_amount` das recorrencias ativas com vencimento no mes (parcelas so ate a ultima);
- parte variavel (categorias `kind=variavel`, excluindo transacoes que ja pertencem a recorrencias): mediana dos ultimos 3 meses; se houver >= 13 meses de historico, media entre essa mediana e o valor de `m-12` (naive sazonal);
- `low`/`high` = p25/p75 dos ultimos 6 meses da parte variavel + parte fixa;
- `method` em cada linha: `recorrencia`, `mediana3`, `sazonal`.
Total do mes = soma das categorias. Receita nao entra na previsao de gastos; aparece separada se pedida.
v2 (quando historico > 24 meses): `statsforecast` AutoETS por categoria, mantendo a parte fixa como esta.

## Testes obrigatorios (fixtures sinteticas)
Assinatura mensal estavel no cartao; parcela 3/12 com fim calculado; Pix mensal com valor igual -> `detectada`; conta de luz mensal com cv alto -> `detectada` confidence baixa; compras aleatorias no mesmo mercado -> nao recorrente; transferencia entre contas proprias -> excluida; previsao com 3 e com 13 meses de historico.
