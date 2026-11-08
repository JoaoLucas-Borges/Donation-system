from flask import Blueprint, request

from app import validacao as v
from app.auth.decorators import login_required
from app.db import db
from app.models import Evento

bp = Blueprint("eventos_api", __name__, url_prefix="/api/eventos")


def evento_para_dict(evento):
    return {
        "id": evento.id,
        "nome": evento.nome,
        "data": evento.data.isoformat(),
        "local": evento.local,
    }


@bp.get("")
@login_required
def listar():
    eventos = db.session.scalars(
        db.select(Evento).order_by(Evento.data.desc(), Evento.id.desc())
    ).all()
    return [evento_para_dict(e) for e in eventos]


@bp.post("")
@login_required
def criar():
    dados = v.json_obrigatorio(request)
    evento = Evento(
        nome=v.texto(dados, "nome", obrigatorio=True),
        data=v.data_iso(dados, "data"),
        local=v.texto(dados, "local"),
    )
    db.session.add(evento)
    db.session.commit()
    return evento_para_dict(evento), 201
