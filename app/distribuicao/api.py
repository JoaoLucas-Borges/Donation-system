import uuid
from datetime import datetime, timedelta, timezone

from flask import Blueprint, request
from sqlalchemy.dialects.postgresql import insert

from app import validacao as v
from app.auth.decorators import login_required, operador_atual_id
from app.db import db
from app.models import Distribuicao, Evento

bp = Blueprint("distribuicao_api", __name__)

LOTE_MAXIMO = 500


def ler_clique(dados):
    if not isinstance(dados, dict):
        raise v.ErroValidacao(None, "Clique inválido.")

    try:
        client_id = uuid.UUID(str(dados.get("client_id")))
    except ValueError:
        raise v.ErroValidacao("client_id", "Deve ser um UUID.")

    quantidade = v.inteiro(dados, "quantidade")
    if quantidade not in (1, -1):
        raise v.ErroValidacao("quantidade", "Deve ser 1 ou -1.")

    try:
        clicado_em = datetime.fromisoformat(str(dados.get("clicado_em")))
    except ValueError:
        raise v.ErroValidacao("clicado_em", "Data e hora inválidas.")
    if clicado_em.tzinfo is None:
        raise v.ErroValidacao("clicado_em", "Informe o fuso horário (ex.: ...Z).")
    # Relógio do notebook adiantado não pode fazer o clique ser recusado
    # (recusado sai da fila e a porção sumiria). Usa a hora do servidor.
    agora = datetime.now(timezone.utc)
    if clicado_em > agora + timedelta(minutes=10):
        clicado_em = agora

    return {
        "client_id": client_id,
        "evento_id": v.inteiro(dados, "evento_id"),
        "quantidade": quantidade,
        "clicado_em": clicado_em,
    }


@bp.post("/api/distribuicoes")
@login_required
def registrar():
    """Recebe um clique ou um lote da fila offline.

    Responde com os client_id confirmados (gravados agora ou já gravados
    antes) e os rejeitados. O navegador tira os dois da fila: rejeitado
    nunca vai passar, e deixar na fila travaria os próximos envios.
    """
    dados = request.get_json(silent=True)
    if isinstance(dados, dict):
        dados = [dados]
    if not isinstance(dados, list):
        raise v.ErroValidacao(None, "Envie um clique ou uma lista de cliques.")
    if len(dados) > LOTE_MAXIMO:
        raise v.ErroValidacao(None, f"Envie no máximo {LOTE_MAXIMO} cliques por vez.")

    validos, rejeitados = [], []
    for item in dados:
        try:
            validos.append(ler_clique(item))
        except v.ErroValidacao as erro:
            client_id = item.get("client_id") if isinstance(item, dict) else None
            rejeitados.append({"client_id": client_id, "erro": f"{erro.campo}: {erro.mensagem}"})

    # Confere numa consulta só se os eventos existem
    ids = {c["evento_id"] for c in validos}
    existentes = set(db.session.scalars(db.select(Evento.id).where(Evento.id.in_(ids)))) if ids else set()
    for clique in [c for c in validos if c["evento_id"] not in existentes]:
        validos.remove(clique)
        rejeitados.append({"client_id": str(clique["client_id"]), "erro": "evento_id: Evento não encontrado."})

    if validos:
        operador_id = operador_atual_id()
        # ON CONFLICT DO NOTHING: se o clique já chegou antes (reenvio da fila), ignora
        db.session.execute(
            insert(Distribuicao)
            .values([{**c, "operador_id": operador_id} for c in validos])
            .on_conflict_do_nothing(index_elements=["client_id"])
        )
        db.session.commit()

    return {
        "confirmados": [str(c["client_id"]) for c in validos],
        "rejeitados": rejeitados,
    }


@bp.get("/api/eventos/<int:evento_id>/contador")
@login_required
def contador(evento_id):
    db.get_or_404(Evento, evento_id)
    total = db.session.scalar(
        db.select(db.func.coalesce(db.func.sum(Distribuicao.quantidade), 0))
        .where(Distribuicao.evento_id == evento_id)
    )
    return {"evento_id": evento_id, "total": int(total)}
