"""Normalizacao de descricao de transacao. Regras em .claude/skills/dominio-financeiro/SKILL.md.

O objetivo nao e um nome bonito, e uma chave estavel para agrupar o mesmo comerciante: "NETFLIX.COM 03/12",
"Netflix.com" e "NETFLIX.COM SAO PAULO BR" precisam virar a mesma string.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass

_PARCELA = re.compile(r"\b(?:parc(?:ela)?\.?\s*)?(\d{1,2})\s*(?:/|de)\s*(\d{1,2})\b", re.IGNORECASE)
_DATA = re.compile(r"\b\d{1,2}/\d{1,2}(?:/\d{2,4})?\b")
_HORA = re.compile(r"\b\d{1,2}:\d{2}(?::\d{2})?\b")
_NUMEROS = re.compile(r"\b\d{3,}\b")
_PREFIXOS = re.compile(
    r"^(?:pix\s+(?:enviado|recebido|transf(?:erencia)?)?|compra\s+(?:no\s+)?(?:debito|credito|cartao)|"
    r"pagamento(?:\s+de)?(?:\s+boleto|\s+fatura)?|transferencia(?:\s+enviada|\s+recebida)?|ted|doc|debito\s+automatico|"
    r"compra)\b[\s:-]*",
    re.IGNORECASE,
)
_UF = "ac|al|ap|am|ba|ce|df|es|go|ma|mt|ms|mg|pa|pb|pr|pe|pi|rj|rn|rs|ro|rr|sc|sp|se|to"
# ate 2 palavras de cidade antes da UF; com 3 o regex comeria o nome ("netflix com sao paulo br")
_CIDADE_UF = re.compile(rf"\s+(?:[a-z]+\s+){{0,2}}(?:{_UF}|br|bra|brasil)$")
_SEPARADORES = re.compile(r"[*\-_/.,;:|]+")
_ESPACOS = re.compile(r"\s+")


@dataclass(frozen=True)
class Normalizada:
    description_norm: str
    installment_n: int | None = None
    installment_total: int | None = None


def _sem_acento(texto: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFKD", texto) if not unicodedata.combining(c))


def normalizar(description: str) -> Normalizada:
    """Chave de agrupamento + parcela detectada. Ordem importa: parcela e data saem antes dos numeros
    genericos para nao perder o "3/12"; cidade/UF sai por ultimo porque depende do fim da string limpa."""
    texto = _sem_acento(description or "").lower()

    parcela = _PARCELA.search(texto)
    n = total = None
    if parcela:
        n, total = int(parcela.group(1)), int(parcela.group(2))
        if not (1 <= n <= total <= 99):
            n = total = None
        texto = texto[: parcela.start()] + " " + texto[parcela.end() :]

    texto = _DATA.sub(" ", texto)
    texto = _HORA.sub(" ", texto)
    texto = _SEPARADORES.sub(" ", texto)
    texto = _NUMEROS.sub(" ", texto)
    texto = _PREFIXOS.sub("", texto.strip())
    texto = _ESPACOS.sub(" ", texto).strip()
    texto = _CIDADE_UF.sub("", texto) if len(texto.split()) > 1 else texto
    texto = texto.strip()

    if not texto:
        texto = (description or "").lower().strip()
    return Normalizada(texto, n, total)
