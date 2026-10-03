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
Prioridade: `transaction_overrides.category_id` > primeira `category_rules` por `priority` cujo regex casa em `description_norm` ou `description` > mapeamento de `pluggy_category` (sem acento/caixa) > `Sem categoria`. Regex das regras: case-insensitive; as regras seed usam `` para nao casar pedaco de palavra.
Gasto (totais, recorrencia, previsao) = `amount < 0`, nao excluida e categoria fora de kind `transferencia` (Investimentos, Transferencia) e fora de kind `receita`.
Receita (resumo) = `amount > 0`, nao excluida, categoria fora de kind `transferencia`. Por isso pagamento de fatura ("Pagamento recebido" no cartao, `Credit card payment` na Pluggy) e mapeado para Transferencia, nunca para Receita: a compra ja contou no cartao.
`exclude=true` no override tira a transacao de totais, recorrencias e previsao (ex.: transferencia entre contas proprias). Transferencias entre contas do proprio usuario sao detectadas quando ha par (saida em A, entrada em B) com mesmo valor em ate 2 dias: marcar categoria `Transferencia` (kind `transferencia`) e excluir dos totais. O override automatico (`note = auto:transferencia interna`) e removido no recalculo seguinte se o par deixar de existir (valor corrigido por re-sync); o manual nunca e tocado.
Regra seed que deixa de valer entra em `REGRAS_RETIRADAS` e e apagada no proximo seed, senao continua vencendo em bancos antigos.
"Sem categoria" e cobrada no painel: `/summary` devolve `uncategorized {count, total}` dos gastos da janela, e a tela de transacoes aceita `?cat=<id>`. Ao trocar a categoria de uma transacao a tela oferece "Aplicar as parecidas": cria regra `^<description_norm escapada>$` com priority 1 (decisao explicita vence as regras base).

Categorias base (seed), `kind` entre parenteses: Moradia (fixo), Contas e servicos (fixo), Assinaturas (fixo), Alimentacao (variavel), Mercado (variavel), Transporte (variavel), Saude (variavel), Educacao (fixo), Lazer (variavel), Compras (variavel), Viagem (variavel), Impostos e taxas (fixo), Investimentos (transferencia), Transferencia (transferencia), Receita (receita), Sem categoria (variavel).

## Recorrencia (`recurrence.py`)
Entrada: transacoes nao excluidas, so gastos. Grupo = (`description_norm`, `account_id`).
Para grupo com >= 3 ocorrencias:
- `intervalo` = mediana das diferencas em dias entre datas ordenadas;
- periodicidade: semanal 6-8, mensal 28-33, anual 350-380; fora disso -> nao recorrente;
- regularidade: >= 50% dos intervalos dentro da janela da mediana, senao nao recorrente (so a mediana deixava
  passar compra aleatoria frequente, ex.: lanchonete ~2x/mes com mediana 7 dias por acaso; 50% ainda tolera mes pulado);
- tolerancia de valor: `cv = desvio_padrao / media` dos gastos; estavel se `cv < 0.15`;
- `expected_amount` = mediana; `expected_day` = mediana do dia do mes (mensal); `next_due` = ultima data + intervalo (mensal/anual somam meses de calendario, semanal soma dias);
- `confidence` = min(1, 0.5 + 0.1 * (n - 3)) * (1.0 se estavel senao 0.7).
Tipo:
- `parcela`: `installment_total` presente. `expected_amount` = valor da parcela; `next_due` ate a ultima parcela (`installment_total - installment_n` restantes); `ends_at` = ultima data + restantes meses. Conta de cartao.
- `assinatura`: conta `credit`, mensal ou anual, estavel.
- `detectada`: qualquer outra recorrencia (Pix, debito, boleto, ou cartao sem valor estavel). E o que o usuario mais quer ver.
Grupo com >= 3 ocorrencias mas valores variando muito (`cv >= 0.15`) e ainda periodico vira `detectada` com confidence reduzida (ex.: conta de luz).
Usuario pode `confirmar` (active=true, confidence=1) ou `descartar` (active=false, nunca re-sugerir o mesmo grupo).
Recorrencia sem ocorrencia ha mais de 2 intervalos e marcada `active=false` automaticamente (encerrada).

## Previsao (`forecast.py`), v1
Para cada um dos `h` meses seguintes ao mes de hoje (padrao 3; o mes corrente fica de fora por estar pela metade) e cada categoria. Historico = so meses completos:
- parte fixa = soma de `expected_amount` das recorrencias ativas com vencimento no mes (parcelas so ate a ultima);
- parte variavel (categorias `kind=variavel`, excluindo transacoes que ja pertencem a recorrencias): mediana dos ultimos 3 meses; se houver >= 13 meses de historico, media entre essa mediana e o valor de `m-12` (naive sazonal);
- `low`/`high` = p25/p75 dos ultimos 6 meses da parte variavel + parte fixa;
- `method` em cada linha: `recorrencia` (so parte fixa), `mediana3`, `sazonal` (categoria com parte variavel; a fixa soma no mesmo valor).
Total do mes = soma das categorias. Receita nao entra na previsao de gastos; aparece separada se pedida.
v2 (quando historico > 24 meses): `statsforecast` AutoETS por categoria, mantendo a parte fixa como esta.

## Testes obrigatorios (fixtures sinteticas)
Assinatura mensal estavel no cartao; parcela 3/12 com fim calculado; Pix mensal com valor igual -> `detectada`; conta de luz mensal com cv alto -> `detectada` confidence baixa; compras aleatorias no mesmo mercado -> nao recorrente; transferencia entre contas proprias -> excluida; previsao com 3 e com 13 meses de historico.

## Explorador por tipo de gasto (`explore.py`)
- Janela = os ultimos N meses **completos** (3 a 24) antes do mes atual; meses sem gasto entram com 0.
- Cada mes e dividido em `card` (contas type=credit) x `bank` (demais) e `recurring` (transacoes ligadas a recorrencias nao descartadas) x avulso.
- Extrapolacao = media simples da janela repetida nos proximos `horizon` meses, campo a campo. E uma lente ("quanto esse tipo de gasto custa em media"), nao o modelo de forecast.py; sem tendencia porque com poucos pontos ruidosos a reta erra mais que a media.
- Gasto segue `eh_gasto`: saida nao excluida fora de kind `transferencia` **e** fora de kind `receita` (saida classificada como Receita e estorno ou regra errada).

## Painel: cartao x conta
Recorrencias sao sempre apresentadas separadas por meio de pagamento: **no cartao** (conta type=credit: assinaturas, parcelas e detectadas confirmadas) e **fora do cartao** (Pix, debito, boleto). Nunca somar as duas num numero so sem mostrar as partes.

