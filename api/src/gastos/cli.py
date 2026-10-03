"""CLI `gastos`. Saida curta, so contagens (nunca transacoes) para nao vazar dado pessoal no terminal."""

from __future__ import annotations

from datetime import date
from pathlib import Path

import typer

from gastos.core.config import RAIZ, settings
from gastos.core.db import SessionLocal, criar_tabelas
from gastos.domain.pipeline import recalcular

app = typer.Typer(help="Controle de Gastos", no_args_is_help=True)


@app.command("recalcular")
def recalcular_cmd():
    """Refaz categorias automaticas, recorrencias e previsao sem importar nada."""
    criar_tabelas()
    with SessionLocal() as sessao:
        r = recalcular(sessao)
    typer.echo(", ".join(f"{k}={v}" for k, v in r.items()))


@app.command()
def sync(desde: str = typer.Option(None, help="YYYY-MM-DD; padrao: desde o ultimo sync")):
    """Sincroniza as contas do Meu Pluggy."""
    from gastos.ingest.pluggy_client import PluggyClient
    from gastos.ingest.pluggy_sync import itens_para_sync, sincronizar

    criar_tabelas()
    with SessionLocal() as sessao:
        itens = itens_para_sync(sessao)
    if not settings.pluggy_credenciais or not itens:
        typer.echo(
            "Pluggy nao configurado: defina PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET no .env e "
            "conecte um banco no app (ou defina PLUGGY_ITEM_IDS)"
        )
        raise typer.Exit(1) from None
    client = PluggyClient(settings.pluggy_base_url, settings.pluggy_client_id, settings.pluggy_client_secret)
    try:
        with SessionLocal() as sessao:
            r = sincronizar(sessao, client, itens, date.fromisoformat(desde) if desde else None)
            recalcular(sessao)
    finally:
        client.close()
    typer.echo(
        f"{r['items']} itens, {r['accounts']} contas, {r['transactions_new']} novas, "
        f"{r['transactions_updated']} atualizadas"
    )
    for e in r["errors"]:
        typer.echo(f"aviso: {e}")


@app.command("import")
def importar(caminho: Path = typer.Argument(RAIZ / "data" / "inbox", help="pasta ou arquivo .ofx/.csv")):
    """Importa extratos OFX e CSV."""
    from gastos.ingest.arquivos import importar_arquivo

    criar_tabelas()
    arquivos = (
        [caminho]
        if caminho.is_file()
        else sorted(p for p in caminho.rglob("*") if p.suffix.lower() in (".ofx", ".csv"))
    )
    novas = atualizadas = contas = 0
    with SessionLocal() as sessao:
        for arq in arquivos:
            try:
                c, n, a = importar_arquivo(sessao, arq)
            except Exception as e:  # um arquivo ruim nao pode barrar o resto da pasta
                sessao.rollback()
                typer.echo(f"erro em {arq.name}: {e}")
                continue
            contas, novas, atualizadas = contas + c, novas + n, atualizadas + a
        if arquivos:
            recalcular(sessao)
    typer.echo(f"{len(arquivos)} arquivos, {contas} contas novas, {novas} novas, {atualizadas} atualizadas")


@app.command("demo-seed")
def demo_seed():
    """Popula o banco com dados sinteticos."""
    criar_tabelas()
    try:
        from gastos.domain.demo import popular_demo
    except ImportError:
        typer.echo("demo ainda nao disponivel")
        raise typer.Exit(1) from None
    with SessionLocal() as sessao:
        popular_demo(sessao)
    typer.echo("dados de demonstracao criados")


if __name__ == "__main__":
    app()
