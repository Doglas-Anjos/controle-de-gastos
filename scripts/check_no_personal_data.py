"""Barreira contra dados pessoais no repositorio.

Roda como hook de pre-commit e como hook do Claude Code antes de `git commit`/`git push`.
Falha (exit 1) se algum arquivo staged estiver em caminho proibido ou se o diff staged
contiver padroes de dado pessoal. Com --history varre todo o historico (`git log -p`) lido
da entrada padrao, para auditoria antes do primeiro push.
"""
from __future__ import annotations

import re
import subprocess
import sys

CAMINHOS_PROIBIDOS = (
    re.compile(r"^data/(?!inbox/\.gitkeep$|exports/\.gitkeep$)"),
    re.compile(r"^\.env$|^\.env\.(?!example$)"),
    re.compile(r"\.(db|sqlite3?|ofx|qfx)$"),
    re.compile(r"\.(csv|xlsx)$"),
)
CAMINHOS_PERMITIDOS = (re.compile(r"^api/tests/fixtures/"),)

# Padroes no conteudo. Cada um tem um nome para a mensagem de erro.
PADROES = {
    "CPF formatado": re.compile(r"\b\d{3}\.\d{3}\.\d{3}-\d{2}\b"),
    "chave OpenAI": re.compile(r"sk-[A-Za-z0-9_-]{20,}"),
    "credencial Pluggy": re.compile(
        r"(?i)pluggy_client_(id|secret)\s*[:=]\s*[\"']?[a-f0-9-]{20,}"
    ),
    "item id Pluggy": re.compile(r"(?i)pluggy_item_ids\s*[:=]\s*[\"']?[a-f0-9-]{36}"),
    "agencia/conta real": re.compile(
        r"(?i)\b(ag(encia)?|cc|conta)\s*[:.]?\s*\d{3,5}-?\d?\s*[/,]\s*(c/?c|conta)?\s*\d{4,12}-?\d\b"
    ),
}
PLACEHOLDERS = re.compile(r"000\.000\.000-00|sk-xxx|SEU_|YOUR_|<[a-z_]+>")


def _git(*args: str) -> str:
    return subprocess.run(["git", *args], capture_output=True, text=True, check=False).stdout


def _permitido(caminho: str) -> bool:
    return any(p.search(caminho) for p in CAMINHOS_PERMITIDOS)


def verificar_caminhos(arquivos: list[str]) -> list[str]:
    erros = []
    for arq in arquivos:
        if _permitido(arq):
            continue
        if any(p.search(arq) for p in CAMINHOS_PROIBIDOS):
            erros.append(f"caminho proibido no commit: {arq}")
    return erros


def verificar_conteudo(texto: str) -> list[str]:
    erros = []
    for n, linha in enumerate(texto.splitlines(), 1):
        if not linha.startswith("+") or linha.startswith("+++"):
            continue
        if PLACEHOLDERS.search(linha):
            continue
        for nome, padrao in PADROES.items():
            if padrao.search(linha):
                erros.append(f"{nome} na linha {n} do diff: {linha[:80]}")
    return erros


def main() -> int:
    if "--history" in sys.argv:
        erros = verificar_conteudo(sys.stdin.read())
    else:
        staged = [a for a in _git("diff", "--cached", "--name-only", "--diff-filter=ACMR").split("\n") if a]
        erros = verificar_caminhos(staged) + verificar_conteudo(_git("diff", "--cached", "--unified=0"))
    if erros:
        print("BLOQUEADO: possivel dado pessoal indo para o repositorio.", file=sys.stderr)
        for e in erros:
            print(f"  - {e}", file=sys.stderr)
        print("Remova do stage (git restore --staged <arquivo>) ou substitua por dado sintetico.", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
