"""Descobre o banco de uma conta Pluggy quando o conector nao diz (itens do Meu Pluggy chegam todos
como "MeuPluggy"). A API nao expoe a instituicao de origem num item proxy; as pistas estao no nome e
no nome comercial da conta ("NuConta", "Conta Inter", "Itau Uniclass", "Ourocard").
"""

from __future__ import annotations

import re
import unicodedata

# ordem importa: "bb " antes de outras para "BB Conta Facil"; palavras curtas usam \b para nao casar
# dentro de outras ("inter" em "internacional" e aceitavel? nao: exige \binter\b).
_BANCOS: list[tuple[str, str]] = [
    (r"\bnu ?bank\b|\bnu ?conta\b|\bnu\b", "Nubank"),
    (r"\binter\b", "Inter"),
    (r"\bitau\b|\buniclass\b|\bpersonnalite\b|\bitaucard\b", "Itau"),
    (r"\bbanco do brasil\b|\bbb\b|\bourocard\b|\bbrasil\b", "Banco do Brasil"),
    (r"\bbradesco\b", "Bradesco"),
    (r"\bsantander\b", "Santander"),
    (r"\bcaixa\b", "Caixa"),
    (r"\bc6\b", "C6"),
    (r"\bbtg\b", "BTG"),
    (r"\bxp\b", "XP"),
    (r"\bmercado pago\b", "Mercado Pago"),
    (r"\bpicpay\b", "PicPay"),
    (r"\bpagbank\b|\bpagseguro\b", "PagBank"),
]
_GENERICOS = ("pluggy", "open finance", "openfinance")


def _norm(texto: str | None) -> str:
    t = unicodedata.normalize("NFKD", texto or "")
    return "".join(c for c in t if not unicodedata.combining(c)).lower()


def inferir_banco(conta: dict, conector: str | None) -> str:
    """Nome canonico do banco pelas pistas da conta; cai no conector quando ele nao e generico, e em
    "Banco" quando nada ajuda (o usuario renomeia na tela)."""
    texto = _norm(f"{conta.get('name') or ''} {conta.get('marketingName') or ''}")
    for padrao, nome in _BANCOS:
        if re.search(padrao, texto):
            return nome
    con = conector or ""
    if con and not any(g in _norm(con) for g in _GENERICOS):
        return con
    return "Banco"


def montar_hint(conta: dict) -> str | None:
    """Pista curta para reconhecer a conta: nome comercial, ou bandeira e nivel do cartao, ou os ultimos
    4 caracteres do numero. Nunca o numero inteiro nem titular."""
    if conta.get("marketingName"):
        return str(conta["marketingName"])[:80]
    credito = conta.get("creditData") or {}
    if credito.get("brand"):
        return " ".join(str(x).title() for x in (credito.get("brand"), credito.get("level")) if x)[:80]
    numero = re.sub(r"\D", "", str(conta.get("number") or ""))
    return f"final {numero[-4:]}" if len(numero) >= 4 else None
