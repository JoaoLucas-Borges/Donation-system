import secrets

import click
from flask.cli import with_appcontext
from werkzeug.security import check_password_hash, generate_password_hash

from app.db import db
from app.models import Operador


@click.command("criar-operador")
@click.argument("nome")
@with_appcontext
def criar_operador(nome):
    """Cria um operador e imprime o código de 6 dígitos (só uma vez)."""
    ativos = db.session.scalars(db.select(Operador).where(Operador.ativo)).all()

    # Sorteia até achar um código que nenhum operador ativo use,
    # porque o login identifica a pessoa só pelo código.
    while True:
        codigo = f"{secrets.randbelow(1_000_000):06d}"
        if not any(check_password_hash(o.codigo_hash, codigo) for o in ativos):
            break

    operador = Operador(nome=nome, codigo_hash=generate_password_hash(codigo))
    db.session.add(operador)
    db.session.commit()

    click.echo(f"Operador {operador.nome} criado (id {operador.id}).")
    click.echo(f"Código de acesso: {codigo}")
    click.echo("Anote agora: o código não fica salvo e não dá para ver de novo.")
