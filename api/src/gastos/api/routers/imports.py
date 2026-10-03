"""Upload de extratos. Arquivo vai para diretorio temporario so pelo tempo do parse; nada fica em disco."""

from __future__ import annotations

import tempfile
from pathlib import Path

from fastapi import APIRouter, Depends, UploadFile
from sqlalchemy.orm import Session

from gastos.api.schemas import ImportResult
from gastos.core.db import get_session
from gastos.domain.pipeline import recalcular
from gastos.ingest.arquivos import importar_arquivo

router = APIRouter()


@router.post("/import/upload", response_model=ImportResult)
async def importar(files: list[UploadFile], sessao: Session = Depends(get_session)):
    res = ImportResult(files=0, accounts_created=0, transactions_new=0, transactions_updated=0)
    with tempfile.TemporaryDirectory() as tmp:
        for f in files:
            nome = Path(f.filename or "upload").name  # basename: o nome vem do cliente
            destino = Path(tmp) / nome
            destino.write_bytes(await f.read())
            try:
                c, n, a = importar_arquivo(sessao, destino)
            except Exception as e:  # um arquivo ruim nao derruba os demais; so o tipo do erro, sem conteudo
                sessao.rollback()
                res.errors.append(f"{nome}: nao foi possivel importar ({type(e).__name__})")
                continue
            res.files += 1
            res.accounts_created += c
            res.transactions_new += n
            res.transactions_updated += a
    if res.files:
        recalcular(sessao)
    return res
