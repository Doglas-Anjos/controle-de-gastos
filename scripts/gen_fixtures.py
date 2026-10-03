"""Gera api/tests/fixtures/demo/transacoes.json a partir de gastos.domain.demo.gerar_dados (seed 42).

Uso: api/.venv/Scripts/python.exe scripts/gen_fixtures.py
Saida deterministica: rodar de novo nao muda o arquivo (test_demo confere isso).
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RAIZ / "api" / "src"))

from gastos.domain.demo import CAMINHO_FIXTURE, gerar_dados  # noqa: E402


def main() -> None:
    dados = gerar_dados()
    CAMINHO_FIXTURE.parent.mkdir(parents=True, exist_ok=True)
    CAMINHO_FIXTURE.write_text(json.dumps(dados, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"{len(dados['transacoes'])} transacoes -> {CAMINHO_FIXTURE.relative_to(RAIZ)}")


if __name__ == "__main__":
    main()
